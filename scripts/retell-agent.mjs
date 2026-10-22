#!/usr/bin/env node
/**
 * retell-agent.mjs - creates or updates the MealDrop phone ordering agent in Retell.
 *
 * ONE shared agent answers for every restaurant: the inbound webhook (retellVoice)
 * tells it which restaurant was called, through dynamic variables.
 *
 *   RETELL_API_KEY=key node scripts/retell-agent.mjs                create LLM + agent, print ids
 *   RETELL_API_KEY=key LLM_ID=.. AGENT_ID=.. node scripts/retell-agent.mjs   update both in place
 *   RETELL_API_KEY=key node scripts/retell-agent.mjs voices          list British voices
 *
 * Optional: VOICE_ID (default below), MODEL (default gpt-5.4-mini), APP_URL.
 */
const KEY = process.env.RETELL_API_KEY;
if (!KEY) { console.error('Set RETELL_API_KEY'); process.exit(1); }
const APP = (process.env.APP_URL || 'https://mealdrop.base44.app').replace(/\/$/, '');
const URL_ = `${APP}/functions/retellVoice`;
const API = 'https://api.retellai.com';

async function api(method, path, body) {
    const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const t = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${t.slice(0, 600)}`);
    return t ? JSON.parse(t) : {};
}

const PROMPT = `You answer the phone for {{restaurant_name}}, a UK takeaway, and take food orders. You are an automated assistant: say so if asked, never pretend to be a person.

## Facts for this call
- Open now: {{restaurant_open}} {{closed_reason}}
- Delivery available now: {{delivery_available}}. Typical delivery time: {{delivery_time}}.
- Collection available now: {{collection_available}}. Restaurant address: {{restaurant_address}}
- Cash accepted: {{cash_accepted}}. Card payment is by a secure link we text to the caller's mobile.
- Caller's number: {{caller_number}} (mobile: {{caller_is_mobile}})
- Returning customer: {{returning_customer}}
- A person can take over: {{transfer_available}}

## How to speak
- This is a phone call. Keep every reply to one or two short sentences, then stop and let them talk.
- Ask ONE question at a time. Sound warm, quick and natural, like good takeaway staff on a busy night.
- Say prices like "nine forty-nine" or "nine pounds forty-nine". Never read out ids, codes or symbols.
- If you didn't catch something, ask them to repeat it. Never guess an item, quantity or option.

## Taking the order
1. If the restaurant is closed, say so politely, give the reason, and end the call.
2. Ask what they'd like. You can take items before asking delivery or collection.
3. For every item: call search_menu with what they said. Only ever offer items search_menu returns, at the prices it returns - never invent items, prices or deals. If two results could fit, ask which one.
4. Call add_item with the menu_item_id and quantity. Put any choices they ALREADY said in "choices" (group + option). Do not guess choices they haven't given.
5. If add_item or choose_option returns waiting_for, ask that question (read the options if they're unsure), then call choose_option with their answer. Repeat until the item is added. If they change their mind about the item, call skip_item.
6. After each item, ask "Anything else?" Use change_quantity to change or remove a line (quantity 0 removes it); call get_order first if you need line numbers.
7. Ask "Is that for delivery or collection?" and call set_order_type.
   - Delivery: ask for the postcode, read it back letter by letter to confirm, then call check_delivery. If outside the area, offer collection. If below the minimum, say how much more they need.
   - Then take the house number and street, and save it with set_customer (address).
8. Take a name for the order (set_customer with name). The order uses the number they're calling from ({{caller_number}}) unless they give another; if the number is withheld, ask for one.
9. Call get_order and read back the whole order and the total. Fix anything they correct.
10. Ask how they'd like to pay: cash on delivery or collection (only offer this if cash accepted is yes), or card by a text link.
    - Cash: call place_order with payment "cash".
    - Card: call place_order with payment "card". If it says the text could not be sent, ask for a UK mobile number, save it with set_customer, and try again - or offer cash.
11. Tell them the result in one sentence (order placed and time, or link sent and that it works for 2 hours), thank them, and end the call with end_call.

## Rules
- Allergies: call get_item_details and repeat only the allergens listed. Never say anything is allergen-free. For a serious allergy, offer to put them through to the team.
- Questions you can't answer from the tools (complaints, refunds, an existing order, opening times you don't have, anything off-menu): offer to transfer. Before transferring, call note_transfer with a few words of reason, then call transfer_to_restaurant. If a person can't take over ({{transfer_available}} is no), apologise and suggest they call back later.
- If the caller asks for a person, transfer straight away (note_transfer first).
- If a tool returns ok false, use its "say" and "next" to decide what to do. Never read raw tool output aloud.
- Stay on this restaurant's food orders. Politely decline anything else.`;

const fn = (name, description, properties = {}, required = [], extra = {}) => ({
    type: 'custom', name, description, url: URL_, method: 'POST',
    parameters: { type: 'object', properties, required },
    speak_during_execution: false, speak_after_execution: true, timeout_ms: 15000, max_retry: 0, ...extra,
});
const waitLine = (text) => ({ speak_during_execution: true, execution_message_type: 'static_text', execution_message_description: text });

const TOOLS = [
    fn('search_menu', 'Find menu items matching what the caller asked for. Use before adding any item.',
        { query: { type: 'string', description: "What the caller said, e.g. 'chicken burger' or 'large chips'" } }, ['query']),
    fn('get_item_details', 'Description, allergens and choices of one menu item. Use for questions about an item or allergies.',
        { menu_item_id: { type: 'string' } }, ['menu_item_id']),
    fn('add_item', 'Add an item to the order. Include only choices the caller already stated.', {
        menu_item_id: { type: 'string' },
        quantity: { type: 'integer', minimum: 1 },
        choices: { type: 'array', description: 'Choices the caller already gave', items: { type: 'object', properties: { group: { type: 'string', description: 'e.g. Size, Flavour, Drink' }, option: { type: 'string', description: 'e.g. Large, Hot, Pepsi' } }, required: ['group', 'option'] } },
    }, ['menu_item_id', 'quantity']),
    fn('choose_option', 'Give the caller\'s answer to the waiting_for question.', { option: { type: 'string', description: 'The option the caller chose' } }, ['option']),
    fn('skip_item', 'Drop the item that is waiting for a choice, if the caller no longer wants it.'),
    fn('change_quantity', 'Change how many of a basket line. Quantity 0 removes the line.', {
        line: { type: 'integer', minimum: 1, description: 'Line number from get_order' }, quantity: { type: 'integer', minimum: 0 },
    }, ['line', 'quantity']),
    fn('get_order', 'The current order lines and totals. Use to read the order back or to find line numbers.'),
    fn('set_order_type', 'Delivery or collection.', { order_type: { type: 'string', enum: ['delivery', 'collection'] } }, ['order_type']),
    fn('check_delivery', 'Check we deliver to a postcode, and the fee and minimum.', {
        postcode: { type: 'string', description: 'Full UK postcode, e.g. RM18 7NR' }, address: { type: 'string', description: 'House number and street, if given' },
    }, ['postcode'], waitLine('Let me just check that postcode.')),
    fn('set_customer', 'Save the caller\'s name, a different phone number, or the delivery address.', {
        name: { type: 'string' }, phone: { type: 'string', description: 'Only if different from the number they are calling from' },
        address: { type: 'string', description: 'House number and street' }, postcode: { type: 'string' },
    }),
    fn('place_order', 'Place the order once the caller has confirmed it. Cash places it now; card texts a payment link.', {
        payment: { type: 'string', enum: ['cash', 'card'] }, notes: { type: 'string', description: 'Short note for the kitchen or driver, if the caller gave one' },
    }, ['payment'], { ...waitLine('Great, putting that through now.'), timeout_ms: 30000 }),
    fn('note_transfer', 'Record why the caller is being put through to the team. Call right before transfer_to_restaurant.', { reason: { type: 'string' } }, ['reason']),
    { type: 'transfer_call', name: 'transfer_to_restaurant', description: 'Put the caller through to a person at the restaurant.',
        transfer_destination: { type: 'predefined', number: '{{transfer_number}}' },
        transfer_option: { type: 'cold_transfer', show_transferee_as_caller: true },
        speak_during_execution: true, execution_message_type: 'static_text', execution_message_description: "No problem, I'll put you through now." },
    { type: 'end_call', name: 'end_call', description: 'End the call once the order is placed or the link is sent and you have said goodbye, or if the restaurant is closed.' },
];

const LLM = {
    model_config: { type: 'cascading', primary: { model: process.env.MODEL || 'gpt-5.4-mini' }, temperature: 0.2 },
    general_prompt: PROMPT,
    start_speaker: 'agent',
    begin_message: "Hi, thanks for calling {{restaurant_name}}. You're through to our automated ordering assistant, and calls may be recorded. What can I get for you?",
    general_tools: TOOLS,
    default_dynamic_variables: {
        restaurant_name: 'the restaurant', restaurant_open: 'yes', closed_reason: '', delivery_available: 'yes', collection_available: 'yes',
        cash_accepted: 'yes', delivery_time: '30 to 45 minutes', restaurant_address: '', caller_number: 'withheld', caller_is_mobile: 'no',
        returning_customer: 'no', transfer_available: 'no', transfer_number: '', session_id: '',
    },
};

const AGENT = (llmId, voiceId) => ({
    response_engine: { type: 'retell-llm', llm_id: llmId },
    voice_id: voiceId,
    agent_name: 'MealDrop phone ordering',
    language: 'en-GB',
    webhook_url: URL_,
    webhook_events: ['call_ended', 'call_analyzed'],
    interruption_sensitivity: 0.8,
    responsiveness: 0.9,
    enable_backchannel: true,
    backchannel_frequency: 0.6,
    max_call_duration_ms: 15 * 60 * 1000,
    end_call_after_silence_ms: 30000,
    boosted_keywords: ['peri peri', 'doner', 'shish', 'kebab', 'wrap', 'nuggets', 'coleslaw', 'Pepsi Max', 'Tango', 'Fanta', 'milkshake', 'collection', 'delivery'],
    data_storage_setting: 'everything',
});

const mode = process.argv[2];
if (mode === 'voices') {
    const voices = await api('GET', '/list-voices');
    for (const v of voices.filter((x) => /brit|uk|english \(uk\)|en-gb/i.test(`${x.accent} ${x.voice_name} ${x.description || ''}`)))
        console.log(`${v.voice_id}\t${v.provider}\t${v.gender}\t${v.accent}\t${v.voice_name}`);
    process.exit(0);
}

const VOICE = process.env.VOICE_ID || '11labs-Anthony';
if (process.env.LLM_ID && process.env.AGENT_ID) {
    await api('PATCH', `/update-retell-llm/${process.env.LLM_ID}`, LLM);
    await api('PATCH', `/update-agent/${process.env.AGENT_ID}`, AGENT(process.env.LLM_ID, VOICE));
    console.log(JSON.stringify({ updated: true, llm_id: process.env.LLM_ID, agent_id: process.env.AGENT_ID }));
} else {
    const llm = await api('POST', '/create-retell-llm', LLM);
    const agent = await api('POST', '/create-agent', AGENT(llm.llm_id, VOICE));
    console.log(JSON.stringify({ created: true, llm_id: llm.llm_id, agent_id: agent.agent_id }));
}
