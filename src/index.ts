import express from 'express'
import { createHealthRouter } from './routes/health.js'
import { createDefaultProbes } from './services/health/probes.js'
import bulkRouter from './routes/bulk.js'
import { validate } from './middleware/validate.js'
import { rateLimit } from './middleware/rateLimit.js'
import {
  trustPathParamsSchema,
  bondPathParamsSchema,
  attestationsPathParamsSchema,
  attestationsQuerySchema,
  createAttestationBodySchema,
} from './schemas/index.js'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())

/** Rate limit: 100 requests per minute per client (IP or API key); configurable per route. */
app.use(
  rateLimit({
    windowMs: 60_000,
    maxPerWindow: 100,
  }),
)

const healthProbes = createDefaultProbes()
app.use('/api/health', createHealthRouter(healthProbes))

/** Public: trust score by address (path validation) */
app.get(
  '/api/trust/:address',
  validate({ params: trustPathParamsSchema }),
  (req, res) => {
    const { address } = req.validated!.params!
    // Placeholder: in production, fetch from DB / reputation engine
    res.json({
      address,
      score: 0,
      bondedAmount: '0',
      bondStart: null,
      attestationCount: 0,
    })
  },
)

/** Public: bond status by address (path validation) */
app.get(
  '/api/bond/:address',
  validate({ params: bondPathParamsSchema }),
  (req, res) => {
    const { address } = req.validated!.params!
    res.json({
      address,
      bondedAmount: '0',
      bondStart: null,
      bondDuration: null,
      active: false,
    })
  },
)

/** Public: list attestations for address (path + query validation) */
app.get(
  '/api/attestations/:address',
  validate({ params: attestationsPathParamsSchema, query: attestationsQuerySchema }),
  (req, res) => {
    const { address } = req.validated!.params!
    const { limit, offset } = req.validated!.query!
    res.json({
      address,
      limit,
      offset,
      attestations: [],
    })
  },
)

/** Protected (future): create attestation (body validation). Apply auth middleware as needed. */
app.post(
  '/api/attestations',
  validate({ body: createAttestationBodySchema }),
  (req, res) => {
    const body = req.validated!.body!
    res.status(201).json({
      subject: body.subject,
      value: body.value,
      key: body.key ?? null,
    })
  },
)

// Bulk verification endpoint (Enterprise)
app.use('/api/bulk', bulkRouter)

export { app }
export default app

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Credence API listening on http://localhost:${PORT}`)
  })
}
