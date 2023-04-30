import { config } from 'dotenv';
import fetch from 'node-fetch';

config();

const OPENAI_API_HOST = 'https://api.openai.com';

async function fetchAnswer() {
  const key = null;
  const answerMessage = { role: 'user', content: 'what is the capital of India?'};

  const answerRes = await fetch(`${OPENAI_API_HOST}/v1/chat/completions`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`,
      ...(process.env.OPENAI_ORGANIZATION && {
        'OpenAI-Organization': process.env.OPENAI_ORGANIZATION,
      }),
    },
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant. Respond in Markdown.`,
        },
        answerMessage,
      ],
      max_tokens: 1000,
      temperature: 1,
      stream: false,
    }),
  });

  const answerData = await answerRes.json();

  // console.log(answerData);
  const extractedAnswer = answerData.choices && answerData.choices[0].message;
  console.log('Extracted Answer:', extractedAnswer);
}

fetchAnswer();
