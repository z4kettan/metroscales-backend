// Seeds the first dealer admin. With `--demo` it also adds a sample shop
// that mirrors the old app's screenshots (branch, two scales, vegetables,
// a week of sales) so the apps have something to show.
//
//   npm run db:seed          dealer admin + demo shop (local development)
//   npm run db:seed:prod     dealer admin only
import { PrismaClient, Prisma, Role, StockMovementType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const demo = process.argv.includes('--demo');

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@metroscales.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (demo ? 'admin12345' : '');
  if (!adminPassword) throw new Error('Set SEED_ADMIN_PASSWORD to create the dealer admin');

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: { name: 'Dealer Admin', email: adminEmail, role: Role.DEALER_ADMIN, secretHash: await bcrypt.hash(adminPassword, 10) },
    update: {},
  });
  console.log(`Dealer admin: ${adminEmail}`);

  if (!demo) return;

  const existing = await prisma.customer.findFirst({ where: { name: 'Metro Vegetables (demo)' } });
  if (existing) {
    console.log('Demo shop already exists, skipping');
    return;
  }

  const customer = await prisma.customer.create({
    data: {
      name: 'Metro Vegetables (demo)',
      contactName: 'Demo Owner',
      phone: '9800000000',
      subscriptionEndsAt: new Date(Date.now() + 10 * 86_400_000),
      users: {
        create: [
          { name: 'admin', email: 'owner@demo.local', role: Role.OWNER, secretHash: await bcrypt.hash('1234', 10) },
        ],
      },
      branches: { create: [{ name: 'AYYAPPANKAVU' }, { name: 'KALOOR' }] },
      categories: { create: [{ code: 1, name: 'Vegetables' }, { code: 2, name: 'Fruits' }] },
    },
    include: { branches: true, categories: true },
  });
  const [main, second] = customer.branches.sort((a, b) => a.name.localeCompare(b.name));
  const veg = customer.categories.find((c) => c.code === 1)!;
  const fruit = customer.categories.find((c) => c.code === 2)!;

  const staff = await prisma.user.create({
    data: {
      name: 'Counter Staff', email: 'staff@demo.local', role: Role.STAFF, customerId: customer.id,
      secretHash: await bcrypt.hash('1111', 10), branches: { create: [{ branchId: main.id }] },
    },
  });

  const catalog: [string, number, string, 'KG' | 'PACK'][] = [
    ['Valiya Ulli', 60, veg.id, 'KG'],
    ['Cheriya Ulli', 70, veg.id, 'KG'],
    ['Payar', 40, veg.id, 'KG'],
    ['Thakkali', 30, veg.id, 'KG'],
    ['Pacha Mulaku', 60, veg.id, 'KG'],
    ['Vendakka', 48, veg.id, 'KG'],
    ['Carrot', 56, veg.id, 'KG'],
    ['Beans (Green)', 80, veg.id, 'KG'],
    ['Banana (Nendran)', 65, fruit.id, 'KG'],
    ['Apple', 180, fruit.id, 'KG'],
    ['Coriander bunch', 10, veg.id, 'PACK'],
  ];
  const items: Prisma.ItemGetPayload<object>[] = [];
  for (const [i, [name, price, categoryId, unit]] of catalog.entries()) {
    items.push(
      await prisma.item.create({
        data: {
          customerId: customer.id, plu: i + 1, name, unit, categoryId, defaultPrice: price,
          branchItems: {
            create: [
              { branchId: main.id, price, stock: 25 },
              { branchId: second.id, price: price + 2, stock: 10 },
            ],
          },
        },
      }),
    );
  }

  const now = new Date();
  const [s1, s2] = await Promise.all([
    prisma.scale.create({
      data: { mac: '0023F01A9740', name: 'Y201', model: 'MRTT-PR/Y201', number: 1, customerId: customer.id, branchId: main.id, storeName: 'METRO VEG', lastSeenAt: now },
    }),
    prisma.scale.create({
      data: { mac: '0023F01AD591', name: 'Y202', model: 'MRTT-PR/Y202', number: 2, customerId: customer.id, branchId: main.id, storeName: 'METRO VEG' },
    }),
  ]);
  await prisma.scale.create({ data: { mac: '0023F01B0001', name: 'Y202 (in stock)', model: 'MRTT-PR/Y202' } });

  await prisma.billSettings.create({
    data: { branchId: main.id, header: 'METRO VEGETABLES', billFooter: 'Thank you, visit again', offerTitle: 'Fresh daily' },
  });

  // A week of sales on the main branch
  let billNo = 1;
  for (let day = 6; day >= 0; day--) {
    const bills = 3 + ((day * 7) % 5);
    for (let b = 0; b < bills; b++) {
      const billedAt = new Date(now.getTime() - day * 86_400_000 - (b + 1) * 37 * 60_000);
      const picks = [items[(b + day) % items.length], items[(b * 3 + 1) % items.length]];
      const lines = picks.map((it, k) => {
        const quantity = new Prisma.Decimal(it.unit === 'PACK' ? 2 : 0.25 + ((b + k) % 4) * 0.35).toDecimalPlaces(3);
        const price = it.defaultPrice;
        return { itemId: it.id, plu: it.plu, name: it.name, unit: it.unit, quantity, price, amount: quantity.times(price).toDecimalPlaces(2) };
      });
      const subtotal = lines.reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
      const discount = new Prisma.Decimal(b % 4 === 0 ? 5 : 0);
      const bill = await prisma.bill.create({
        data: {
          branchId: main.id, scaleId: b % 2 ? s2.id : s1.id, billNo: String(billNo++), billedAt,
          subtotal, discount, total: subtotal.minus(discount), lines: { create: lines },
        },
      });
      for (const l of lines) {
        const bi = await prisma.branchItem.update({
          where: { branchId_itemId: { branchId: main.id, itemId: l.itemId } },
          data: { stock: { decrement: l.quantity } },
        });
        await prisma.stockMovement.create({
          data: { branchId: main.id, itemId: l.itemId, type: StockMovementType.SALE, quantity: l.quantity.negated(), balance: bi.stock, refId: bill.id },
        });
      }
    }
  }

  console.log('Demo shop created:');
  console.log('  owner  owner@demo.local / PIN 1234');
  console.log(`  staff  ${staff.email} / PIN 1111 (AYYAPPANKAVU only)`);
  console.log('  scales 0023F01A9740, 0023F01AD591 (assigned), 0023F01B0001 (unassigned)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
