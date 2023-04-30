import { createMachine, interpret, assign, spawn } from 'xstate';

const mockOpenAIAPI = async (messages) => {
    const userMessage = messages[messages.length - 1].content;

    if (userMessage.toLowerCase().includes('trigger')) {
        return { role: 'assistant', content: 'TRIGGER API_CALL' };
    } else {
        return { role: 'assistant', content: `Reply to: ${userMessage}` };
    }
};

const mockAPICall = async () => {
    console.log("calling API")
    return { status: 'success', message: 'API call successful.' };
};

const myAgentMachine = createMachine({
    predictableActionArguments: true,
    id: 'myAgent',
    initial: 'waitingForUserMessage',
    context: {
        messages: []
    },
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
                src: 'mockAPICall',
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
        mockAPICall: () => mockAPICall()
    }
});

const myAgentService = interpret(myAgentMachine)
    .onTransition((state, event) => {
        console.log("----")
        console.log('State:', state.value);
        console.log('Messages:', state.context.messages)
    })
    .onStop((state) => {
        console.log('Final state reached:', state.value);
    })
    .start();
setTimeout(() => myAgentService.send({ type: 'USER_MESSAGE', content: 'TRIGGER' }), 1000);