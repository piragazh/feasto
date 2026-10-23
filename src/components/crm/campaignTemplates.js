// Ready-made campaign templates for the composer.
// SMS bodies are kept short: the send worker adds "<Restaurant>: " in front and
// "Reply STOP to opt out" at the end, and the whole text should fit one SMS (160 characters).
// Only plain characters (and £, which SMS supports) are used - no emoji or curly quotes - so a
// message stays one part.
// Tokens: {first_name} {restaurant} {favourite_item} {coupon_code} {order_link} {days_since_last_order}

const unique = (discount_type, discount_value, validity_days = 14, minimum_order = 0) => ({
    coupon_mode: 'unique',
    coupon_config: { discount_type, discount_value, validity_days, minimum_order },
});
const noOffer = { coupon_mode: 'none' };

export const CAMPAIGN_TEMPLATES = [
    {
        id: 'win_back',
        name: 'We miss you',
        category: 'Win back',
        description: 'Regulars who are overdue',
        segment_key: 'sys:at_risk',
        offer: unique('percentage', 15, 14),
        sms: { body: "Hi {first_name}, we miss you! Here's 15% off your next order. Use code {coupon_code} within 14 days." },
        email: {
            subject: 'We miss you, {first_name}',
            heading: "It's been a while!",
            body: "It's been {days_since_last_order} days since your last order and we'd love to cook for you again.\n\nHere's 15% off your next order - just use your code at checkout within 14 days.",
            button_text: 'Order now',
        },
    },
    {
        id: 'lapsed',
        name: 'Come back offer',
        category: 'Win back',
        description: "Customers who haven't ordered in 90+ days",
        segment_key: 'sys:lapsed',
        offer: unique('percentage', 20, 21),
        sms: { body: "Long time no see, {first_name}! Come back for 20% off with code {coupon_code}. Valid 3 weeks." },
        email: {
            subject: '20% off - come back and see us',
            heading: 'Long time no see!',
            body: "We haven't seen you in a while, {first_name}. A lot has been cooking since your last visit.\n\nCome back for 20% off your next order - your code is valid for 3 weeks.",
            button_text: 'Claim 20% off',
        },
    },
    {
        id: 'second_order',
        name: 'Second order nudge',
        category: 'Grow',
        description: 'Customers who have ordered once',
        segment_key: 'sys:once',
        offer: unique('fixed', 3, 14, 10),
        sms: { body: "Hi {first_name}, fancy {favourite_item} again? Here's £3 off your next order: {coupon_code}" },
        email: {
            subject: '£3 off your next order, {first_name}',
            heading: 'Ready for round two?',
            body: "Thanks for ordering with us! Fancy {favourite_item} again?\n\nHere's £3 off your next order of £10 or more.",
            button_text: 'Order again',
        },
    },
    {
        id: 'vip_thanks',
        name: 'Thank you, regulars',
        category: 'Loyalty',
        description: 'Your VIP customers',
        segment_key: 'sys:vip',
        offer: unique('percentage', 10, 30),
        sms: { body: "Thank you {first_name}! You're one of our best customers. Enjoy 10% off with code {coupon_code}." },
        email: {
            subject: 'A thank you from {restaurant}',
            heading: "You're one of our best customers",
            body: "We just wanted to say thank you, {first_name}. Regulars like you keep a local business going.\n\nAs a small thank you, here's 10% off your next order.",
            button_text: 'Order now',
        },
    },
    {
        id: 'new_item',
        name: 'New on the menu',
        category: 'News',
        description: 'Tell everyone about something new',
        segment_key: 'sys:marketable',
        offer: noOffer,
        sms: { body: 'Something new at {restaurant}! [NEW ITEM] is now on the menu. Try it today.' },
        email: {
            subject: 'New on the menu at {restaurant}',
            heading: 'Say hello to [NEW ITEM]',
            body: "We've just added [NEW ITEM] to the menu and we think you're going to love it.\n\n[One or two lines about what makes it special.]",
            button_text: 'See the menu',
        },
    },
    {
        id: 'weekend',
        name: 'Weekend special',
        category: 'Promotion',
        description: 'Boost Friday to Sunday',
        segment_key: 'sys:marketable',
        offer: unique('percentage', 10, 3),
        sms: { body: "Weekend treat, {first_name}! 10% off at {restaurant} this weekend with code {coupon_code}." },
        email: {
            subject: 'Your weekend treat is here',
            heading: 'Weekend sorted',
            body: "Put your feet up this weekend - we'll do the cooking.\n\nEnjoy 10% off your order from Friday to Sunday.",
            button_text: 'Order for the weekend',
        },
    },
    {
        id: 'quiet_night',
        name: 'Midweek deal',
        category: 'Promotion',
        description: 'Fill quiet Monday to Wednesday nights',
        segment_key: 'sys:active',
        offer: unique('percentage', 15, 3),
        sms: { body: "Midweek deal: 15% off tonight or tomorrow, {first_name}. Use code {coupon_code}." },
        email: {
            subject: '15% off this midweek',
            heading: 'Midweek just got better',
            body: "No cooking tonight, {first_name}. Enjoy 15% off your order - valid for the next 3 days.",
            button_text: 'Order now',
        },
    },
    {
        id: 'free_delivery',
        name: 'Free delivery',
        category: 'Promotion',
        description: 'Free delivery for a limited time',
        segment_key: 'sys:marketable',
        offer: { coupon_mode: 'shared' },
        sms: { body: "Free delivery from {restaurant} today only! Use code {coupon_code} at checkout." },
        email: {
            subject: 'Free delivery today only',
            heading: 'Delivery is on us',
            body: "Today only, we're covering your delivery. Use your code at checkout.",
            button_text: 'Order with free delivery',
        },
        note: 'Pick one of your free-delivery coupons on the Offer step.',
    },
    {
        id: 'birthday',
        name: 'Birthday treat',
        category: 'Loyalty',
        description: 'Customers with a birthday this month',
        segment_key: 'sys:birthday',
        offer: unique('percentage', 20, 10),
        sms: { body: "Happy birthday month, {first_name}! Treat yourself: 20% off with code {coupon_code}." },
        email: {
            subject: 'A birthday treat for you, {first_name}',
            heading: 'Happy birthday!',
            body: "It's your birthday month, so the treat is on us.\n\nEnjoy 20% off your order - your code is valid for 10 days.",
            button_text: 'Claim my treat',
        },
    },
    {
        id: 'match_night',
        name: 'Big game night',
        category: 'Event',
        description: 'Football, boxing or any big night in',
        segment_key: 'sys:marketable',
        offer: unique('percentage', 10, 2),
        sms: { body: "Big game tonight? Order from {restaurant} before kick-off: 10% off with {coupon_code}." },
        email: {
            subject: 'Game night sorted',
            heading: 'Food for the big game',
            body: "Big game tonight? Get your order in before kick-off and enjoy 10% off.\n\nPerfect for sharing - wings, boxes and sides for the whole crew.",
            button_text: 'Order before kick-off',
        },
    },
    {
        id: 'hours_update',
        name: 'Opening hours update',
        category: 'News',
        description: 'Holiday hours, closures or late opening',
        segment_key: 'sys:marketable',
        offer: noOffer,
        sms: { body: "Heads up from {restaurant}: [DATE] we're open [HOURS]. See you soon!" },
        email: {
            subject: 'Opening hours update from {restaurant}',
            heading: 'Our hours are changing',
            body: "Just so you know, on [DATE] we'll be open [HOURS].\n\nThanks for supporting us - we can't wait to cook for you.",
            button_text: 'Order now',
        },
    },
    {
        id: 'review',
        name: 'Ask for a review',
        category: 'Feedback',
        description: 'Recent customers',
        segment_key: 'sys:active',
        offer: noOffer,
        sms: { body: "Thanks for ordering, {first_name}! How did we do? A quick review means a lot to us." },
        email: {
            subject: 'How did we do, {first_name}?',
            heading: 'We would love your feedback',
            body: "Thanks for ordering from {restaurant}. A quick review helps a small local business more than you'd think.",
            button_text: 'Leave a review',
        },
    },
];

/** Fields a template sets in the composer for the chosen channel. */
export function applyTemplate(t, channel) {
    const msg = channel === 'email' ? t.email : t.sms;
    return {
        name: t.name,
        segment_key: t.segment_key,
        ...(channel === 'email'
            ? { subject: msg.subject, heading: msg.heading, body: msg.body, button_text: msg.button_text }
            : { body: msg.body }),
        ...t.offer,
    };
}

/** Message-only fields, for switching wording without touching audience or offer. */
export function templateMessage(t, channel) {
    const msg = channel === 'email' ? t.email : t.sms;
    return channel === 'email'
        ? { subject: msg.subject, heading: msg.heading, body: msg.body, button_text: msg.button_text }
        : { body: msg.body };
}
