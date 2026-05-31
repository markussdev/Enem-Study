// Estado rico da pagina de topico.
// Reusa topic_state_v1 do recommendation-engine.js para evitar dados paralelos.

const UI_LABELS = {
  status: {
    novo: 'Não iniciado',
    nao_iniciado: 'Não iniciado',
    em_estudo: 'Em estudo',
    parcial: 'Médio',
    dominado: 'Forte',
    dificuldade: 'Fraco',
    fraco: 'Fraco',
    medio: 'Médio',
    forte: 'Forte',
    concluido: 'Concluído',
  },
  difficulty: {
    nao_avaliado: 'Dificuldade não avaliada',
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
    critica: 'Crítica',
  },
  questionStatus: {
    nao_respondida: 'Não respondida',
    acertei: 'Acertei',
    errei: 'Errei',
    chutei: 'Acertei chutando',
  },
  errorReason: {
    conteudo: 'Não sabia o conteúdo',
    interpretacao: 'Errei interpretação',
    calculo: 'Errei cálculo',
    conceito: 'Confundi conceito',
    atencao: 'Falta de atenção',
    inicio: 'Não soube começar',
  },
  noteType: {
    resumo: 'Resumo',
    ideia: 'Ideia central',
    exemplo: 'Exemplo',
    formula: 'Fórmula / regra',
    duvida: 'Dúvida',
    erro: 'Erro',
    atencao: 'Ponto de atenção',
    enem: 'Como cai no ENEM',
    texto: 'Texto solto',
  },
}

function label(group, key) {
  return UI_LABELS[group]?.[key] || key
}

const TOPIC_NOTE_TYPE_META = {
  resumo: {
    label: label('noteType', 'resumo'),
    icon: 'book-open',
    template: '- Ideia principal:\n- Como aparece no ENEM:\n- Palavra-chave:',
  },
  ideia: {
    label: label('noteType', 'ideia'),
    icon: 'target',
    template: 'Ideia principal:\n\nPor que isso importa:',
  },
  exemplo: {
    label: label('noteType', 'exemplo'),
    icon: 'lightbulb',
    template: 'Situação:\n\nComo resolver:\n\nConclusão:',
  },
  formula: {
    label: label('noteType', 'formula'),
    icon: 'sigma',
    template: 'Expressão:\n\nQuando usar:\n\nCuidados:',
  },
  duvida: {
    label: label('noteType', 'duvida'),
    icon: 'circle-help',
    template: 'O que não entendi:\n\nO que preciso revisar:',
  },
  erro: {
    label: label('noteType', 'erro'),
    icon: 'triangle-alert',
    template: 'O que errei:\n\nPor que errei:\n\nComo evitar:',
  },
  atencao: {
    label: label('noteType', 'atencao'),
    icon: 'badge-alert',
    template: 'Atenção:\n\nPor que isso confunde:',
  },
  enem: {
    label: label('noteType', 'enem'),
    icon: 'graduation-cap',
    template: 'Como costuma aparecer:\n\nTipo de questão provável:',
  },
  texto: {
    label: label('noteType', 'texto'),
    icon: 'type',
    template: '',
  },
}

const QUESTION_ERROR_REASON_LABELS = UI_LABELS.errorReason

function createTopicEntityId(prefix = 'item') {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function getTopicRichState(materiaKey, topicoKey) {
  const topicId = getRecommendationTopicId(materiaKey, topicoKey)
  const base = getUserTopicState(topicId)

  return {
    ...base,
    id: topicId,
    materiaKey,
    topicoKey: String(topicoKey),
    status: base.status || 'novo',
    difficulty: base.difficulty || mapLegacyDifficultyToText(materiaKey, topicoKey),
    mastery: Number.isFinite(Number(base.mastery)) ? Number(base.mastery) : getMasteryFromState(base),
    notes: Array.isArray(base.notes) ? base.notes : [],
    videos: Array.isArray(base.videos) ? base.videos : [],
    questions: Array.isArray(base.questions) ? base.questions : [],
    reviews: Array.isArray(base.reviews) ? base.reviews : [],
    lastStudyAt: base.lastStudyAt || null,
    nextReviewAt: base.nextReviewAt || base.proximaRevisao || null,
  }
}

function saveTopicRichState(materiaKey, topicoKey, patch = {}) {
  return saveUserTopicState(getRecommendationTopicId(materiaKey, topicoKey), patch)
}

function mapLegacyDifficultyToText(materiaKey, topicoKey) {
  const value = Number((getDificuldades(materiaKey) || {})[topicoKey] || 0)
  if (value === 1) return 'alta'
  if (value === 2) return 'media'
  if (value === 3) return 'baixa'
  return 'nao_avaliado'
}

function getMasteryFromState(state) {
  if (state.status === 'dominado') return 85
  if (state.status === 'parcial') return 50
  if (state.status === 'dificuldade') return 25
  if (state.concluido) return 75
  if (state.tempoSeg > 0) return 25
  return 0
}

function getTopicStatusMeta(state) {
  if (state.concluido || state.status === 'dominado') {
    return { label: label('status', 'forte'), className: 'forte' }
  }
  if (state.status === 'dificuldade' || state.difficulty === 'alta' || state.difficulty === 'critica') {
    return { label: label('status', 'fraco'), className: 'fraco' }
  }
  if (state.status === 'parcial' || state.difficulty === 'media') {
    return { label: label('status', 'medio'), className: 'medio' }
  }
  if (state.tempoSeg > 0 || state.notes.length || state.videos.length || state.questions.length) {
    return { label: label('status', 'em_estudo'), className: 'em-estudo' }
  }
  return { label: label('status', 'nao_iniciado'), className: 'nao-iniciado' }
}

function setTopicLearningDifficulty(materiaKey, topicoKey, difficulty) {
  const masteryMap = {
    nao_avaliado: 0,
    baixa: 75,
    media: 50,
    alta: 25,
    critica: 10,
  }

  const difficultyToLegacy = {
    baixa: 3,
    media: 2,
    alta: 1,
    critica: 1,
    nao_avaliado: 0,
  }

  const mastery = masteryMap[difficulty] ?? 0
  const status = difficulty === 'baixa'
    ? 'dominado'
    : difficulty === 'media'
      ? 'parcial'
      : difficulty === 'nao_avaliado'
        ? 'novo'
        : 'dificuldade'

  setDificuldade(materiaKey, topicoKey, difficultyToLegacy[difficulty] || 0)
  saveTopicRichState(materiaKey, topicoKey, {
    difficulty,
    mastery,
    status,
    dificuldadeDoUsuario: difficulty === 'critica' ? 4 : difficulty === 'alta' ? 3 : difficulty === 'media' ? 2 : 0,
    nextReviewAt: addDaysISO(getReviewDelayByDifficulty(difficulty)),
    proximaRevisao: addDaysISO(getReviewDelayByDifficulty(difficulty)),
  })
}

function getReviewDelayByDifficulty(difficulty) {
  const map = {
    critica: 1,
    alta: 3,
    media: 7,
    baixa: 14,
    nao_avaliado: 7,
  }

  return map[difficulty] || 7
}

function createReviewFromTopicNote(materiaKey, topicoKey, noteId) {
  const state = getTopicRichState(materiaKey, topicoKey)
  const note = state.notes.find(item => item.id === noteId)
  if (!note) return null

  const review = {
    id: createTopicEntityId('review'),
    sourceNoteId: note.id,
    sourceType: note.type,
    question: generateReviewQuestion(note),
    answer: note.content || '',
    status: 'pendente',
    createdAt: new Date().toISOString(),
    dueAt: addDaysISO(getReviewDelayByDifficulty(state.difficulty)),
  }

  saveTopicRichState(materiaKey, topicoKey, {
    reviews: [review, ...state.reviews],
    nextReviewAt: review.dueAt,
    proximaRevisao: review.dueAt,
  })

  return review
}

function generateReviewQuestion(note) {
  if (note.type === 'duvida') return 'Você consegue responder a dúvida que registrou?'
  if (note.type === 'formula') return 'Você lembra quando usar esta fórmula ou regra?'
  if (note.type === 'erro') return 'Você lembra qual erro cometeu e como evitar?'
  if (note.type === 'resumo') return 'Você consegue explicar a ideia principal deste resumo?'
  if (note.type === 'ideia') return 'Você consegue explicar a ideia central com suas palavras?'
  if (note.type === 'atencao') return 'Você lembra qual ponto de atenção pode causar confusão?'
  if (note.type === 'enem') return 'Você lembra como esse conteúdo costuma aparecer no ENEM?'
  return 'Revise esta anotação.'
}

function resolveTopicReview(materiaKey, topicoKey, reviewId, result) {
  const state = getTopicRichState(materiaKey, topicoKey)
  const reviews = state.reviews.map(review => {
    if (review.id !== reviewId) return review
    return {
      ...review,
      status: result === 'success' ? 'acertei' : 'errei',
      resolvedAt: new Date().toISOString(),
    }
  })

  const patch = { reviews }
  if (result === 'success') {
    patch.mastery = Math.min(100, Number(state.mastery || 0) + 5)
  } else {
    patch.mastery = Math.max(10, Number(state.mastery || 0) - 10)
    patch.difficulty = increaseTopicDifficulty(state.difficulty)
    patch.status = 'dificuldade'
    patch.proximaRevisao = addDaysISO(3)
    patch.nextReviewAt = patch.proximaRevisao
  }

  saveTopicRichState(materiaKey, topicoKey, patch)
}

function deleteTopicReview(materiaKey, topicoKey, reviewId) {
  const state = getTopicRichState(materiaKey, topicoKey)
  const reviews = state.reviews.filter(review => review.id !== reviewId)
  const pendingReviews = reviews
    .filter(review => review.status === 'pendente' && review.dueAt)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
  const nextReviewAt = pendingReviews[0]?.dueAt || null

  saveTopicRichState(materiaKey, topicoKey, {
    reviews,
    nextReviewAt,
    proximaRevisao: nextReviewAt,
  })
}

function increaseTopicDifficulty(current) {
  const order = ['nao_avaliado', 'baixa', 'media', 'alta', 'critica']
  const index = order.indexOf(current)
  return order[Math.min(order.length - 1, Math.max(0, index) + 1)] || 'media'
}

function getTopicSuggestionText(state) {
  const hasDueReview = state.reviews.some(review =>
    review.status === 'pendente' && new Date(review.dueAt) <= new Date()
  )

  if (hasDueReview) return 'você tem revisões pendentes. Resolva elas antes de estudar conteúdo novo.'
  if (!state.notes.length && !state.videos.length && !state.questions.length) return 'comece com uma videoaula curta ou crie um resumo de 3 linhas.'
  if (state.videos.length && !state.notes.length) return 'você salvou vídeo, mas ainda não anotou. Registre uma dúvida ou ideia principal.'
  if (state.notes.length && !state.questions.length) return 'você já anotou teoria. Agora faça questões para testar se entendeu.'
  if (state.difficulty === 'alta' || state.difficulty === 'critica') return 'esse tópico está difícil. Revise erros e gere uma revisão para daqui a poucos dias.'
  if (Number(state.mastery || 0) >= 75) return 'você está bem nesse tópico. Faça uma revisão rápida e siga para o próximo.'
  return 'faça uma revisão rápida, registre um erro ou dúvida e atualize seu domínio.'
}

function getQuestionStatusLabel(status) {
  return label('questionStatus', status) || label('questionStatus', 'nao_respondida')
}
