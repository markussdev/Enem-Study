const { onRequest } = require('firebase-functions/v2/https')

const DEFAULT_MODEL = 'gemini-2.5-flash'

exports.generateVideoNotes = onRequest(
  {
    region: 'us-central1',
    cors: true,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Use POST.' })
      return
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'GEMINI_API_KEY não configurada no ambiente da Function.' })
      return
    }

    const { videoUrl, extraContext = '', video = {}, context = {} } = req.body || {}
    if (!isPublicYouTubeUrl(videoUrl)) {
      res.status(400).json({ error: 'Envie uma URL pública válida do YouTube.' })
      return
    }

    try {
      const aiNotes = await requestGeminiStudyNotes({
        apiKey,
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
        videoUrl,
        extraContext,
        video,
        context,
      })

      res.status(200).json(aiNotes)
    } catch (err) {
      console.error('Erro ao gerar notas do vídeo:', err)
      const message = err.status === 400
        ? 'Não consegui acessar esse vídeo. O Gemini aceita URLs públicas do YouTube; vídeos privados, não listados ou bloqueados podem falhar.'
        : 'Erro ao gerar caderno IA. Tente novamente em instantes.'
      res.status(err.status || 500).json({ error: message })
    }
  }
)

async function requestGeminiStudyNotes({ apiKey, model, videoUrl, extraContext, video, context }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: buildVideoNotesPrompt({ extraContext, video, context }) },
          {
            file_data: {
              file_uri: videoUrl,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.35,
        response_mime_type: 'application/json',
        response_schema: getVideoNotesSchema(),
      },
    }),
  })

  if (!response.ok) {
    const error = new Error(`Gemini respondeu ${response.status}.`)
    error.status = response.status
    throw error
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim()

  if (!text) throw new Error('Gemini não devolveu texto.')
  return parseGeminiJson(text)
}

function buildVideoNotesPrompt({ extraContext, video, context }) {
  return `
Voce e um tutor de ENEM transformando uma aula em anotacoes praticas.

Contexto:
- Materia: ${context.materia || 'Nao informada'}
- Conteudo: ${context.conteudo || 'Nao informado'}
- Topico: ${context.topico || 'Nao informado'}
- Habilidade: ${context.habilidade || 'Nao informada'}
- Video: ${video.title || 'Video salvo'}
- Tipo de video: ${formatVideoType(video.type)}

Tarefa:
Analise o video do YouTube anexado nesta requisicao e devolva somente JSON valido no schema pedido.
Escreva em portugues do Brasil, direto, util para revisao e sem inventar conteudo que nao apareca no material.
Se nao houver formulas ou regras claras, use array vazio em formulasOuRegras.
Priorize o que ajuda o aluno a saber o que anotar, onde costuma errar e como isso pode aparecer no ENEM.
Inclua a ideia central real da aula, nao apenas o titulo do video.

Contexto extra opcional do usuario:
${extraContext || 'Nenhum.'}
`.trim()
}

function getVideoNotesSchema() {
  return {
    type: 'OBJECT',
    properties: {
      resumo: { type: 'STRING' },
      ideiaCentral: { type: 'STRING' },
      formulasOuRegras: { type: 'ARRAY', items: { type: 'STRING' } },
      duvidasProvaveis: { type: 'ARRAY', items: { type: 'STRING' } },
      errosComuns: { type: 'ARRAY', items: { type: 'STRING' } },
      exemplos: { type: 'ARRAY', items: { type: 'STRING' } },
      pontosDeAtencao: { type: 'ARRAY', items: { type: 'STRING' } },
      comoCaiNoEnem: { type: 'STRING' },
    },
    required: [
      'resumo',
      'ideiaCentral',
      'formulasOuRegras',
      'duvidasProvaveis',
      'errosComuns',
      'exemplos',
      'pontosDeAtencao',
      'comoCaiNoEnem',
    ],
  }
}

function parseGeminiJson(text) {
  const clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  return JSON.parse(clean)
}

function isPublicYouTubeUrl(value) {
  if (!value || typeof value !== 'string') return false

  try {
    const url = new URL(value)
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)
  } catch {
    return false
  }
}

function formatVideoType(type) {
  const map = {
    videoaula: 'Videoaula',
    revisao: 'Revisao rapida',
    questao: 'Resolucao de questao',
    aprofundamento: 'Aprofundamento',
  }
  return map[type] || 'Video'
}
