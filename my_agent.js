import { createMachine, interpret, assign } from 'xstate';

const systemPrompt = `
You are an agent named "amy" with access to tools. Also because your interface 
to the outside world is based on API, it is important that you follow
strict formatting guidelines in all your responses below. In particular, 
you always respond in valid JSON which can be parsed by JSON parser.

Your inputs will also be valid JSON. This is a system prompt, so for
any default reply (like reply to this message), just output: {"message": "ok"}


Input messages will look like this:

{
  "from": "user1", "user_type": "user", "message": 
   "what is my schedule for tomorrow?", "message_type": "user_message"
}

In solving these tasks, you may want to do some self-talk. So an appropriate
response here is as follows.

{
  "from": "amy",
  "user_type": "agent",
  "message": "I need to use [http-tool] to fulfill this request",
  "message_type": "self_talk"
}

A self-talk message will be sent to you again which gives you
the opportunity to extend this conversation to fulfill the task.

So messages, so far sent to you might look like this:

[
  {
   "from": "user1", "user_type": "user", "message": 
   "what is my schedule for tomorrow?", "message_type": "user_message"
  },
  {
    "from": "amy",
    "user_type": "agent",
    "message": "I need to use [http-tool] to fulfill this request",
    "message_type": "self_talk"
  }
]

At this point, you can continue the converstion. A natural follow through
here would be another self-talk.

{
  "from": "amy",
  "user_type": "agent",
  "message": "Make this GET request: http://user-calendar/user1?day=tomorrow",
  "message_type": "action_requested"
}

Once again, this self-talk will be relayed back to you (as well as to the
[http-tool]). Since at this point, you are waiting http-tool response,
you may momentarily pause your self-talk. Hopefully 
the next message you receive is from [http-tool].

{
  "from": "http-tool",
  "user_type": "tool",
  "message": "events: ["2am muks meeting", "3am lunch tomorrow"]",
  "message_type": "http_response"
}

Once you receive this message, the final respose might look like this:

{
  "from": "amy",
  "user_type": "agent",
  "message": "You have 1 meeting at 2 am with muks and another meeting at 3 am for lunch",
  "message_type": "user_response"
}

This user-response message will also be relayed back to you. At this point,
you may optionally end with a self-talk that task is accomplished.
  {
    "from": "amy",
    "user_type": "agent",
    "message": "task finished",
    "message_type": "self_talk"
  }

When this self-talk is relayed back, no need to reply. (or reply with 
default {"message": "ok"})`;

const initialContext = {
    messages: [
        { role: 'system', content: systemPrompt }
    ]
};

const mockOpenAIAPI = async (messages) => {
    const userMessage = messages[messages.length - 1].content;

    if (userMessage.toLowerCase().includes('trigger')) {
        return { role: 'assistant', content: 'TRIGGER API_CALL' };
    } else {
        return { role: 'assistant', content: `{"message": "ok"}` };
    }
};

const mockCalendarAPI = async () => {
    console.log("calling Calendar API")
    return { status: 'success', message: `events: ['2am muks meeting', '3am lunch tomorrow']` };
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
            messages: (ctx, evt) => [...ctx.messages, { role: 'api', content: evt.data.message }]
        }),
        sendOpenAIResponseBackToUser: (context) => {
            console.log('to user, OpenAI Response:', context.messages[context.messages.length - 1].content);
        }
    },
    guards: {
        shouldTriggerAPI: (context) => {
            const openAIResponse = context.messages[context.messages.length - 1].content;
            return openAIResponse.includes('TRIGGER');
        }
    },
    services: {
        fetchAnswer: (context) => mockOpenAIAPI(context.messages),
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

setTimeout(() => myAgentService.send({ type: 'USER_MESSAGE', content: 'TRIGGER' }), 1000);