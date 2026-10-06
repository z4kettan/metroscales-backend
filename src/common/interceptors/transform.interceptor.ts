import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  meta: Record<string, any>;
}

/// Prisma returns money and quantities as Decimal objects, which JSON would
/// turn into strings. Clients get plain numbers instead.
export function plainNumbers(value: any): any {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(plainNumbers);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = plainNumbers(v);
    return out;
  }
  return value;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | T> {
    return next.handle().pipe(
      map((responseData) => {
        // Raw responses (e.g. CSV downloads) are written directly
        if (typeof responseData === 'string') return responseData;
        const data = plainNumbers(responseData);
        if (data && data.success !== undefined) return data;
        return { success: true, data: data ?? null, message: 'Request successful', meta: {} };
      }),
    );
  }
}
