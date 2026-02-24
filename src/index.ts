import express from 'express'
import { getPaginationParams, buildPaginatedResponse } from './lib/pagination.js'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'credence-backend' })
})

app.get('/api/trust/:address', (req, res) => {
  const { address } = req.params
  // Placeholder: in production, fetch from DB / reputation engine
  res.json({
    address,
    score: 0,
    bondedAmount: '0',
    bondStart: null,
    attestationCount: 0,
  })
})

app.get('/api/bond/:address', (req, res) => {
  const { address } = req.params
  res.json({
    address,
    bondedAmount: '0',
    bondStart: null,
    bondDuration: null,
    active: false,
  })
})


// Mock data generation
const generateMockData = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i + 1}`, name: `Item ${i + 1}` }));

const ATTESTATIONS = generateMockData('att', 50);
const SCORE_HISTORY = generateMockData('score', 45);
const DISPUTES = generateMockData('disp', 25);

app.get('/api/attestations', (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const data = ATTESTATIONS.slice(offset, offset + limit);
  res.json(buildPaginatedResponse(data, limit, offset, ATTESTATIONS.length));
})

app.get('/api/score-history', (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const data = SCORE_HISTORY.slice(offset, offset + limit);
  res.json(buildPaginatedResponse(data, limit, offset, SCORE_HISTORY.length));
})

app.get('/api/disputes', (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const data = DISPUTES.slice(offset, offset + limit);
  res.json(buildPaginatedResponse(data, limit, offset, DISPUTES.length));
})

/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Credence API listening on http://localhost:${PORT}`)
  })
}

export default app;
