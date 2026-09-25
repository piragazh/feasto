/**
 * scrapeJustEat — RETIRED
 *
 * This logged into Just Eat's Partner Centre AS the restaurant and scraped
 * orders. It is retired, deliberately, and should not be revived:
 *
 *   - it required storing the restaurant's marketplace password, which is full
 *     account access (payouts, bank details, menu, closing the store), not order
 *     access
 *   - scraping breaches Just Eat's terms, and the account suspended would be the
 *     RESTAURANT'S, not ours
 *   - it breaks without warning whenever the portal changes, MFA is enforced or
 *     bot detection trips - reliably mid-service
 *
 * Just Eat is "not integrated" until MealDrop has partner API access. Order
 * capture then works the way Uber Eats already does here: a signed webhook,
 * deduplicated on the platform's own order id.
 *
 * Left in place rather than deleted so any caller fails loudly and explains why.
 */
Deno.serve(() => Response.json({
    error: 'The Just Eat scraper has been retired. Just Eat integration requires partner API access; it will not work by logging in as the restaurant.',
    code: 'SCRAPER_RETIRED',
}, { status: 410 }));
