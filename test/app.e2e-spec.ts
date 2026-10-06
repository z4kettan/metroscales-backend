import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Metro Scales API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = async (email: string, secret: string) => {
    const res = await http.post('/api/auth/login').send({ email, secret }).expect(200);
    return res.body.data.accessToken as string;
  };

  let admin: string;
  let owner: string;
  let staff: string;
  let customerId: string;
  let branchId: string;
  let otherBranchId: string;
  let itemId: string;
  let scaleId: string;
  const MAC = '00:23:F0:AA:BB:CC';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);

    // Clean slate
    await prisma.customer.deleteMany();
    await prisma.scale.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: { name: 'Dealer', email: 'dealer@test.local', role: Role.DEALER_ADMIN, secretHash: await bcrypt.hash('dealerpass', 4) },
    });
    admin = await login('dealer@test.local', 'dealerpass');
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a wrong PIN', async () => {
    await http.post('/api/auth/login').send({ email: 'dealer@test.local', secret: 'nope' }).expect(401);
  });

  it('dealer creates a customer with an owner and a first branch', async () => {
    const res = await http
      .post('/api/admin/customers')
      .set(auth(admin))
      .send({ name: 'Test Veg', owner: { name: 'Owner', email: 'Owner@Test.local', pin: '1234' }, branchName: 'MAIN' })
      .expect(201);
    customerId = res.body.data.id;
    branchId = res.body.data.branches[0].id;
    expect(res.body.data.users[0].email).toBe('owner@test.local');
    owner = await login('owner@test.local', '1234');
  });

  it('dealer registers a scale by MAC and assigns it to the branch', async () => {
    await http.post('/api/admin/scales').set(auth(admin)).send({ mac: 'bad', name: 'X' }).expect(400);
    const res = await http
      .post('/api/admin/scales')
      .set(auth(admin))
      .send({ mac: MAC, name: 'Y201', branchId })
      .expect(201);
    scaleId = res.body.data.id;
    expect(res.body.data.mac).toBe('0023F0AABBCC');
    expect(res.body.data.customer.id).toBe(customerId);
    expect(res.body.data.online).toBe(false);
  });

  it('shop users cannot reach dealer endpoints', async () => {
    await http.get('/api/admin/customers').set(auth(owner)).expect(403);
  });

  it('owner adds a second branch, a category and an item with the next PLU', async () => {
    otherBranchId = (await http.post('/api/branches').set(auth(owner)).send({ name: 'SECOND' }).expect(201)).body.data.id;
    const cat = await http.post('/api/categories').set(auth(owner)).send({ name: 'Vegetables' }).expect(201);
    expect(cat.body.data.code).toBe(1);

    const plu = await http.get('/api/items/next-plu').set(auth(owner)).expect(200);
    expect(plu.body.data.plu).toBe(1);

    const item = await http
      .post('/api/items')
      .set(auth(owner))
      .send({ name: 'Thakkali', categoryId: cat.body.data.id, defaultPrice: 30, price: 32, branchId, gstPercent: 5, gstMode: 'EXCLUDED' })
      .expect(201);
    itemId = item.body.data.id;
    expect(item.body.data.plu).toBe(1);
    expect(item.body.data.price).toBe(32);

    const other = await http.get(`/api/items/${itemId}?branchId=${otherBranchId}`).set(auth(owner)).expect(200);
    expect(other.body.data.price).toBe(30);

    // A new item is queued for the scales straight away
    const history = await http.get(`/api/scales/${scaleId}/commands`).set(auth(owner)).expect(200);
    expect(history.body.data.map((c: any) => c.type)).toContain('PUSH_ITEMS');
  });

  it('rejects a duplicate PLU', async () => {
    await http.post('/api/items').set(auth(owner)).send({ name: 'Dup', plu: 1 }).expect(409);
  });

  it('sets prices per branch and queues a push to the scales', async () => {
    const res = await http
      .put(`/api/branches/${branchId}/prices`)
      .set(auth(owner))
      .send({ prices: [{ itemId, price: 40 }] })
      .expect(200);
    expect(res.body.data.queuedForScales).toBe(1);
    const list = await http.get(`/api/items?branchId=${branchId}&search=thak`).set(auth(owner)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].price).toBe(40);
  });

  it('records a purchase and a stock correction', async () => {
    await http
      .post(`/api/branches/${branchId}/purchases`)
      .set(auth(owner))
      .send({ supplier: 'Market', lines: [{ itemId, quantity: 10, unitCost: 20 }] })
      .expect(201);
    let item = await http.get(`/api/items/${itemId}?branchId=${branchId}`).set(auth(owner));
    expect(item.body.data.stock).toBe(10);

    await http.put(`/api/branches/${branchId}/stock`).set(auth(owner)).send({ stock: [{ itemId, quantity: 8.5 }] }).expect(200);
    item = await http.get(`/api/items/${itemId}?branchId=${branchId}`).set(auth(owner));
    expect(item.body.data.stock).toBe(8.5);
  });

  it('owner adds staff limited to one branch', async () => {
    await http
      .post('/api/users')
      .set(auth(owner))
      .send({ name: 'Staff', email: 'staff@test.local', pin: '9999', role: 'STAFF', branchIds: [branchId] })
      .expect(201);
    staff = await login('staff@test.local', '9999');
    const branches = await http.get('/api/branches').set(auth(staff)).expect(200);
    expect(branches.body.data.map((b: any) => b.id)).toEqual([branchId]);
    await http.get(`/api/reports/summary?branchId=${otherBranchId}`).set(auth(staff)).expect(403);
    await http.put(`/api/branches/${branchId}/prices`).set(auth(staff)).send({ prices: [{ itemId, price: 1 }] }).expect(403);
  });

  it('a scale goes online, uploads a bill once, and stock goes down', async () => {
    await http.post(`/api/device-sim/${MAC}/heartbeat`).send({}).expect(200);
    const scale = await http.get(`/api/scales/${scaleId}`).set(auth(owner)).expect(200);
    expect(scale.body.data.online).toBe(true);

    const bill = { billNo: '1', billedAt: new Date().toISOString(), discount: 2, lines: [{ plu: 1, quantity: 0.5 }] };
    const first = await http.post(`/api/device-sim/${MAC}/bills`).send(bill).expect(201);
    expect(first.body.data.duplicate).toBe(false);
    // 0.5 kg x 40 = 20, +5% GST = 1, -2 discount
    expect(first.body.data.bill.total).toBe(19);
    const again = await http.post(`/api/device-sim/${MAC}/bills`).send(bill).expect(201);
    expect(again.body.data.duplicate).toBe(true);

    const item = await http.get(`/api/items/${itemId}?branchId=${branchId}`).set(auth(owner));
    expect(item.body.data.stock).toBe(8);

    const summary = await http.get(`/api/reports/summary?branchId=${branchId}`).set(auth(staff)).expect(200);
    expect(summary.body.data).toMatchObject({ bills: 1, total: 19, discount: 2 });
  });

  it('reports a daily range including empty days, and as CSV', async () => {
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const from = new Date(Date.now() + 330 * 60_000 - 2 * 86_400_000).toISOString().slice(0, 10);
    const res = await http.get(`/api/reports/daily?branchId=${branchId}&from=${from}&to=${today}`).set(auth(owner)).expect(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[2]).toMatchObject({ date: today, bills: 1 });
    const csv = await http.get(`/api/reports/daily.csv?branchId=${branchId}&from=${from}&to=${today}`).set(auth(owner)).expect(200);
    expect(csv.text.split('\n')[0]).toBe('Date,Bills,Total,Discount,Tax');
  });

  it('queues scale settings and hands them to the scale with full item data', async () => {
    await http.put(`/api/scales/${scaleId}/shortcuts`).set(auth(owner)).send({ shortcuts: [{ keyNo: 1, layer: 1, itemId }] }).expect(200);
    await http.post(`/api/scales/${scaleId}/wifi`).set(auth(owner)).send({ ssid: 'Shop', password: 'secret123' }).expect(200);

    const history = await http.get(`/api/scales/${scaleId}/commands`).set(auth(owner)).expect(200);
    const wifi = history.body.data.find((c: any) => c.type === 'SET_WIFI');
    expect(wifi.payload.password).toBe('••••');

    const commands = await http.get(`/api/device-sim/${MAC}/commands`).expect(200);
    const types = commands.body.data.map((c: any) => c.type).sort();
    expect(types).toEqual(['PUSH_ITEMS', 'SET_SHORTCUTS', 'SET_WIFI']);
    const push = commands.body.data.find((c: any) => c.type === 'PUSH_ITEMS');
    expect(push.payload.items[0]).toMatchObject({ plu: 1, name: 'Thakkali', price: 40 });

    const wifiCmd = commands.body.data.find((c: any) => c.type === 'SET_WIFI');
    await http.post(`/api/device-sim/${MAC}/commands/${wifiCmd.id}/ack`).send({ ok: true }).expect(200);
    const stored = await prisma.scaleCommand.findUniqueOrThrow({ where: { id: wifiCmd.id } });
    expect(stored.status).toBe('DONE');
    expect((stored.payload as any).password).toBeNull();
  });

  it('imports items read from a scale', async () => {
    await http.post(`/api/scales/${scaleId}/commands`).set(auth(owner)).send({ type: 'PULL_ITEMS' }).expect(201);
    const [cmd] = (await http.get(`/api/device-sim/${MAC}/commands`).expect(200)).body.data;
    expect(cmd.type).toBe('PULL_ITEMS');
    await http
      .post(`/api/device-sim/${MAC}/commands/${cmd.id}/ack`)
      .send({ ok: true, items: [{ plu: 2, name: 'Carrot', price: 56 }] })
      .expect(200);
    const list = await http.get(`/api/items?branchId=${branchId}`).set(auth(owner)).expect(200);
    expect(list.body.data.map((i: any) => i.name)).toEqual(['Thakkali', 'Carrot']);
  });

  it('dealer deactivating a customer locks its users out', async () => {
    await http.patch(`/api/admin/customers/${customerId}`).set(auth(admin)).send({ isActive: false }).expect(200);
    await http.get('/api/auth/me').set(auth(owner)).expect(401);
    await http.post('/api/auth/login').send({ email: 'owner@test.local', secret: '1234' }).expect(401);
  });
});
