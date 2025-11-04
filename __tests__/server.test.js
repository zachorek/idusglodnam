process.env.NODE_ENV = 'test';
process.env.SKIP_MONGO = 'true';
process.env.HOST_PASSWORD = 'super-secret';
process.env.DAILY_ORDERS_CRON = '15 6 * * *';
process.env.DAILY_ORDERS_EMAIL = 'raporty@example.com';

const request = require('supertest');

const {
  app,
  createDailyOrdersEmailPayload,
  getDailyOrderReportSettings
} = require('../server');

describe('GET /api/settings/order-reports', () => {
  it('responds with schedule information', async () => {
    const response = await request(app).get('/api/settings/order-reports');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      enabled: expect.any(Boolean),
      targetEmail: expect.any(String),
      cronExpression: expect.any(String),
      timezone: expect.any(String),
      sendsEmptyReport: true
    });
    expect(response.body.scheduledTime).toBe('06:15');
    expect(response.body.targetEmail).toBe('raporty@example.com');
  });
});

describe('createDailyOrdersEmailPayload', () => {
  const reportDate = '2024-01-20';

  it('includes a notice when there are no orders', () => {
    const totals = { ordersCount: 0, grandTotal: 0 };
    const payload = createDailyOrdersEmailPayload(reportDate, [], totals);

    expect(payload.text).toContain('Brak zamówień w poprzednim dniu.');
    expect(payload.html).toContain('Brak zamówień w poprzednim dniu.');
  });

  it('summarises order details when present', () => {
    const orders = [{
      orderId: 'order-1',
      email: 'klient@example.com',
      phone: '123456789',
      products: [
        { name: 'Chałka', quantity: 2, total: 19.98 }
      ],
      totalAfterDiscount: 19.98,
      discountCode: '',
      discountPercent: 0,
      discountAmount: 0,
      sequenceNumber: 1,
      createdAt: new Date('2024-01-19T10:15:00Z'),
      payment: 'place',
      paymentLabel: 'Płatność na miejscu',
      comment: 'Proszę o odbiór o 11:00',
      pickupDate: '2024-01-20'
    }];
    const totals = { ordersCount: 1, grandTotal: 19.98 };

    const payload = createDailyOrdersEmailPayload(reportDate, orders, totals);

    expect(payload.subject).toContain('Zestawienie zamówień');
    expect(payload.text).toContain('Numer w dniu: #1');
    expect(payload.text).toContain('Chałka × 2 — 19.98 zł');
    expect(payload.html).toContain('<li>Chałka × 2 — 19.98 zł</li>');
    expect(payload.html).toContain('Proszę o odbiór o 11:00');
  });

  it('includes discount information when applicable', () => {
    const orders = [{
      orderId: 'order-2',
      email: 'klient@example.com',
      phone: '123456789',
      products: [
        { name: 'Bagietka', quantity: 1, total: 8.50 }
      ],
      totalAfterDiscount: 7.65,
      discountCode: 'PROMO10',
      discountPercent: 10,
      discountAmount: 0.85,
      sequenceNumber: 1,
      createdAt: new Date('2024-01-19T12:00:00Z'),
      payment: 'online',
      paymentLabel: 'Zapłacone online',
      comment: '',
      pickupDate: '2024-01-20'
    }];
    const totals = { ordersCount: 1, grandTotal: 7.65 };

    const payload = createDailyOrdersEmailPayload(reportDate, orders, totals);

    expect(payload.text).toContain('PROMO10');
    expect(payload.html).toContain('PROMO10');
    expect(payload.html).toContain('-0.85 zł');
  });
});

describe('POST /api/order-reports/run', () => {
  it('rejects requests without password', async () => {
    const response = await request(app)
      .post('/api/order-reports/run')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Brak autoryzacji do uruchomienia raportu' });
  });

  it('rejects requests with invalid password', async () => {
    const response = await request(app)
      .post('/api/order-reports/run')
      .send({ password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Brak autoryzacji do uruchomienia raportu' });
  });

  it('rejects invalid reference date before processing', async () => {
    const response = await request(app)
      .post('/api/order-reports/run')
      .send({ password: 'super-secret', date: 'not-a-date' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Nieprawidłowa data referencyjna' });
  });
});

describe('getDailyOrderReportSettings', () => {
  it('reflects configured cron expression', () => {
    const settings = getDailyOrderReportSettings();

    expect(settings.cronExpression).toBe('15 6 * * *');
    expect(settings.scheduledTime).toBe('06:15');
    expect(settings.targetEmail).toBe('raporty@example.com');
  });
});
