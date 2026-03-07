const JSON_PROMPT = `Analyze this media and respond with only valid JSON (no markdown, no code block). Use this exact structure:
{
  "summary": "brief overall description",
  "keyEvents": ["event 1", "event 2"],
  "timestamps": [{"time": "0:00", "description": "what happens"}],
  "detectedObjects": ["object or entity 1", "entity 2"],
  "notableActions": ["action 1", "action 2"]
}
For images, leave "timestamps" as an empty array. For video, add approximate timestamps where possible.`;

async function analyzeMedia(mediaUrl, mediaType) {
  const { GoogleGenAI, createUserContent, createPartFromUri } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const res = await fetch(mediaUrl);
  if (!res.ok) throw new Error(`Failed to fetch media: ${res.status}`);
  const buf = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() ||
    (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
  const blob = new Blob([buf], { type: mimeType });

  const file = await ai.files.upload({ file: blob, config: { mimeType } });
  if (!file.uri) throw new Error('File upload did not return a URI');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: createUserContent([
      createPartFromUri(file.uri, file.mimeType),
      JSON_PROMPT,
    ]),
  });

  const text = (response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(jsonStr);
}

module.exports = { analyzeMedia };
