const clipText = (value, maxLength = 900) => {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return '(empty chunk)';
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

export const toCitations = chunks =>
  chunks.map((chunk, index) => ({
    id: `C${index + 1}`,
    source: chunk.source || 'unknown',
    node_id: chunk.node_id || null,
    score:
      typeof chunk.score === 'number' ? Number(chunk.score.toFixed(4)) : null,
    snippet: clipText(chunk.chunk_text, 260),
  }));

export const buildRagPrompt = ({ question, chunks, graphContext }) => {
  const citations = toCitations(chunks);

  const chunkSection = citations
    .map(citation => {
      const matchedChunk = chunks.find(
        chunk => chunk.node_id === citation.node_id
      );
      return [
        `[${citation.id}]`,
        `source=${citation.source}`,
        `node_id=${citation.node_id || 'n/a'}`,
        `score=${citation.score ?? 'n/a'}`,
        `text=${clipText(matchedChunk?.chunk_text || citation.snippet)}`,
      ].join(' | ');
    })
    .join('\n');

  const graphSection = graphContext.length
    ? graphContext
        .map(
          (context, index) =>
            `[G${index + 1}] root=${context.root_id || 'n/a'} type=${context.root_type || 'n/a'} nodes=${context.node_count} edges=${context.edge_count}`
        )
        .join('\n')
    : 'No causal graph context available.';

  const systemPrompt = [
    'You are the Stackmind AI Query service.',
    'Answer only from the provided retrieval context.',
    'If evidence is weak or missing, explicitly say what is unknown.',
    'Every factual statement must include at least one citation token like [C1] or [C3].',
    'Keep the response concise and useful for engineering teams.',
  ].join(' ');

  const userPrompt = [
    `Question: ${question}`,
    '',
    'Retrieved Chunks:',
    chunkSection || 'No matching chunks found.',
    '',
    'Graph Causal Context:',
    graphSection,
    '',
    'Response format:',
    '1) Direct answer',
    '2) Key evidence (bullet list with citations)',
    '3) Uncertainty or gaps',
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    citations,
  };
};
