import preRevenueHandler from '../src/server/routes/tier1/pre-revenue.ts';
import irrDebugHandler from '../src/server/routes/tier1/irr-debug.ts';

export default async function handler(req: any, res: any): Promise<void> {
  if (String(req.query?.debug_irr ?? '') === '1') {
    await irrDebugHandler(req, res);
    return;
  }
  await preRevenueHandler(req, res);
}
