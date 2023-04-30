import { interpret, assign, spawn, sendTo, createMachine } from 'xstate';

import { config } from 'dotenv';
import fetch from 'node-fetch';

config();

const OPENAI_API_HOST = 'https://api.openai.com';



async function fetchAnswer(context, event) {
  console.log("calling openai", event.content)
  const answerMessage = { role: 'user', content: event.content };
  const body = {
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
  }
  // console.log("calling OpenAI with", body)

  const answerRes = await fetch(`${OPENAI_API_HOST}/v1/chat/completions`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    method: 'POST',
    body: JSON.stringify(body),
  });

  const answerData = await answerRes.json();
  const extractedAnswer = answerData.choices && answerData.choices[0].message;
  return extractedAnswer; // outputs {content: "", role: ""}
}

const apiCaller = (callback, receive) => {
  receive(async (event) => {
    if (event.type === 'API_CALL') {
      const extractedAnswer = await fetchAnswer(event.context, { content: event.content });
      callback({ type: 'REPLY_RECEIVED', extractedAnswer });
    }
  });
};


const agentMachine = createMachine(
  {
    id: 'agent',
    initial: 'idle',
    context: {
      content: 'You are a helpful assistant, follow instructions carefully',
      counter: 1,
    },
    states: {
      idle: {
        entry: assign({
          apiActor: () => spawn(apiCaller),
        }),
        after: {
          1000: 'running',
        },
      },
      running: {
        entry: ['apiCall'],
        on: {
          REPLY_RECEIVED: {
            target: 'checkExpectedOutput',
            actions: ['processReply'],
          },
        },
      },
      checkExpectedOutput: {
        on: {
          '': [
            {
              target: 'running',
              cond: (context) => context.expectedOutput !== null,
            },
            {
              target: 'terminate',
            },
          ],
        },
      },
      terminate: {
        type: 'final',
      },
    },
  },
  {
    actions: {
      apiCall: sendTo(
        (context) => context.apiActor,
        (context) => ({
          type: 'API_CALL',
          context: context,
          content: 'I want you to act as a counter. But you count only when I say next. After this message, just output number "1" and nothing else and wait until I say "next number please". Then reply with "2" and nothing else.  When I say "next", then reply 3 and so on. When I say "done", just reply with "thanks". For any other message you receive from me, just reply with "OK".',
        }),
        { to: (context) => context.apiActor }
      ),
      processReply: (context, event) => {
        // Check if the received answer matches the expected output
        if (event.extractedAnswer.content.trim() === `${context.counter}`) {
          context.counter++;
          context.expectedOutput = `${context.counter}`;
        } else {
          context.expectedOutput = null;
        }
      },
    },
  }
);

const agentService = interpret(agentMachine)
  .onTransition((state, event) => {
    if (state.changed) {
      console.log('State:', state.toStrings());
      console.log('Context:', state.context.counter);

      if (event.type === 'processReply') {
        console.log('Calling processReply...');
      }
    }
  })
  .start();