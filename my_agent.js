import process from 'process';
import { createMachine, interpret, assign } from 'xstate';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config();

const OPENAI_API_HOST = 'https://api.openai.com';



async function fetchAnswerOpenAI(messages) {
    const body = JSON.stringify({
        model: 'gpt-4',
        messages: messages,
        temperature: 1,
        stream: false,
    })
    // console.log("calling OpenAI with", body)

    const answerRes = await fetch(`${OPENAI_API_HOST}/v1/chat/completions`, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        method: 'POST',
        body: body,
    });
    if (answerRes.status !== 200) {
        console.log(`${answerRes.status}: sent this body: '${body}'`);
        return { content: "{}", role: "assistant" };
    }
    // console.log(answerRes)
    try {
        const answerData = await answerRes.json();
        const extractedAnswer = answerData.choices && answerData.choices[0].message;
        return extractedAnswer; // outputs {content: "", role: ""}
    } catch (error) {
        console.error(error)
    }

}


const systemPrompt = `
You are an agent named "amy" with access to tools. Also because your interface 
to the outside world is based on API, it is important that you follow
strict formatting guidelines in all your responses below. In particular, 
you always respond in valid JSON which can be parsed by JSON parser.

Your inputs will also be valid JSON. This is a system prompt, so for
any default reply (like reply to this message), just output: {"message": "ok", "message_type": "default", "from": "assistant", "to": "system"}


Input messages will look like this:

{
    "message": "user1:what is my schedule for tomorrow?", "message_type": "user_message", "from": "user", "to": "assistant"
}

A natural follow through here would be to request an action via a "request_action" message.
This will trigger an HTTP response. 

{
  "message": "http://user-calendar/user1?day=tomorrow",
  "message_type": "request_action",
  "from": "assistant",
  "to": "tool"
}

This results in an API call and you will get a response back as the next message.

{
  "message": "{"events": [{"name": "2am meeting", "participants": ["muks"]}, {"name": "5am yoga", "participants": []}]}",
  "message_type": "http_response",
  "from": "tool",
  "to": "assistant"
}

Once you receive this message, the final respose might look like this:

{
  "message": "You have 1 meeting at 2 am with muks and another meeting at 5 am to do yoga",
  "message_type": "user_response",
  "from": "assistant",
  "to": "user"
}
`;

const initialContext = {
    messages: [
        { role: 'system', content: systemPrompt }
    ]
};

const mockOpenAIAPI = async (messages) => {
    const userMessage = JSON.parse(messages[messages.length - 1].content);

    if (userMessage.message_type === 'user_message' && userMessage.message.includes('schedule')) {
        const response = {
            message: 'http://user-calendar/user1?day=tomorrow',
            message_type: 'request_action',
            from: 'assistant',
            to: 'tool'
        };

        return { role: 'assistant', content: JSON.stringify(response) };
    } else if (userMessage.message_type === 'http_response') {
        const numEvents = userMessage.message.length;


        const response = {
            message: `You have ${numEvents} events scheduled`,
            message_type: 'user_response',
            from: 'assistant',
            to: 'user'
        };

        return { role: 'assistant', content: JSON.stringify(response) };
    } else {
        const response = {
            message: 'ok',
            message_type: 'default',
            from: 'assistant',
            to: 'system'
        };

        return { role: 'assistant', content: JSON.stringify(response) };
    }
};

const mockCalendarAPI = async () => {
    console.log("calling Calendar API");
    const events = [
        {
            name: "2am meeting",
            participants: ["muks"]
        },
        {
            name: "5am yoga",
            participants: []
        }
    ];


    const response = {
        message: events,
        message_type: 'http_response',
        from: 'tool',
        to: 'assistant'
    };

    return { status: 'success', message: JSON.stringify(response) };
};


const myAgentMachine = createMachine({
    predictableActionArguments: true,
    id: 'myAgent',
    initial: 'waitingForUserMessage',
    context: initialContext,
    states: {
        waitingForUserMessage: {
            on: {
                USER_MESSAGE: {
                    target: 'waitingForReplyFromOpenAI',
                    actions: ['addUserMessage']
                }
            }
        },
        waitingForReplyFromOpenAI: {
            invoke: {
                src: 'fetchAnswer',
                onDone: {
                    target: 'processingResponseFromOpenAI',
                    actions: ['addOpenAIResponse']
                }
            }
        },
        processingResponseFromOpenAI: {
            always: [
                {
                    cond: 'shouldTriggerAPI',
                    target: 'waitingForAPIResponse'
                },
                {
                    target: 'waitingForUserMessage',
                    actions: 'sendOpenAIResponseBackToUser'
                }
            ]
        },
        waitingForAPIResponse: {
            invoke: {
                src: 'mockCalendarAPI',
                onDone: {
                    target: 'waitingForReplyFromOpenAI',
                    actions: ['addAPIResponse']
                }
            }
        }
    }
}, {
    actions: {
        addUserMessage: assign({
            messages: (ctx, evt) => [...ctx.messages, { role: 'user', content: evt.content }]
        }),
        addOpenAIResponse: assign({
            messages: (ctx, evt) => [...ctx.messages, evt.data]
        }),
        addAPIResponse: assign({
            messages: (ctx, evt) => [...ctx.messages, { role: 'user', content: evt.data.message }]
        }),
        sendOpenAIResponseBackToUser: (context) => {
            console.log('to user, OpenAI Response:', context.messages[context.messages.length - 1].content);
        }
    },
    guards: {
        shouldTriggerAPI: (context) => {
            const openAIResponse = JSON.parse(context.messages[context.messages.length - 1].content);
            return openAIResponse.message_type === 'request_action';
        }
    },
    services: {
        fetchAnswer: (context) => process.argv[2] === 'actual' ? fetchAnswerOpenAI(context.messages) : mockOpenAIAPI(context.messages),
        mockCalendarAPI: () => mockCalendarAPI()
    }
});

const abbreviateSystemPrompt = (msg) => {
    if (msg.role === "system") {
        let abbr = msg.content.slice(0, 50) + ' [...]';
        return { role: 'system', content: abbr };
    }
    return msg;
}

const logMessagesByAbbreviatingSystemPrompt = (messages) => {
    return messages.map(msg => abbreviateSystemPrompt(msg));
};


const myAgentService = interpret(myAgentMachine)
    .onTransition((state, event) => {
        console.log("----")
        console.log('State:', state.value);
        console.log('Messages:', logMessagesByAbbreviatingSystemPrompt(state.context.messages));

    })
    .onStop((state) => {
        console.log('Final state reached:', state.value);
    })
    .start();

setTimeout(() => myAgentService.send({ type: 'USER_MESSAGE', content: JSON.stringify({ message: 'What is my schedule for tomorrow?', message_type: 'user_message', from: 'user', to: 'assistant' }) }), 1000);
