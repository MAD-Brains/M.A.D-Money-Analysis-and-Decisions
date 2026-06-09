/**
 * Category keyword mapping
 * Each key is a keyword (lowercase), value is the category it maps to
 */
const CATEGORY_MAP = {
  // Food
  swiggy: 'Food',
  zomato: 'Food',
  food: 'Food',
  lunch: 'Food',
  dinner: 'Food',
  breakfast: 'Food',
  chai: 'Food',
  tea: 'Food',
  coffee: 'Food',
  snacks: 'Food',
  restaurant: 'Food',
  biryani: 'Food',
  pizza: 'Food',
  burger: 'Food',

  // Travel
  uber: 'Travel',
  ola: 'Travel',
  auto: 'Travel',
  metro: 'Travel',
  bus: 'Travel',
  train: 'Travel',
  petrol: 'Travel',
  diesel: 'Travel',
  fuel: 'Travel',
  parking: 'Travel',
  toll: 'Travel',
  rapido: 'Travel',
  cab: 'Travel',
  flight: 'Travel',
  ticket: 'Travel',

  // Subscription
  netflix: 'Subscription',
  spotify: 'Subscription',
  hotstar: 'Subscription',
  prime: 'Subscription',
  youtube: 'Subscription',
  jio: 'Subscription',
  airtel: 'Subscription',
  recharge: 'Subscription',
  subscription: 'Subscription',
  vi: 'Subscription',
  bsnl: 'Subscription',

  // Housing
  rent: 'Housing',
  housing: 'Housing',
  electricity: 'Housing',
  water: 'Housing',
  maintenance: 'Housing',
  gas: 'Housing',
  wifi: 'Housing',
  internet: 'Housing',
  bijli: 'Housing',
  society: 'Housing',

  // Shopping
  amazon: 'Shopping',
  flipkart: 'Shopping',
  myntra: 'Shopping',
  clothes: 'Shopping',
  shoes: 'Shopping',
  shopping: 'Shopping',
  meesho: 'Shopping',
  ajio: 'Shopping',

  // Health
  medicine: 'Health',
  doctor: 'Health',
  hospital: 'Health',
  gym: 'Health',
  pharmacy: 'Health',
  dawai: 'Health',
  checkup: 'Health',

  // Grocery (NEW)
  grocery: 'Grocery',
  sabzi: 'Grocery',
  kirana: 'Grocery',
  atta: 'Grocery',
  doodh: 'Grocery',
  milk: 'Grocery',
  eggs: 'Grocery',
  vegetables: 'Grocery',
  fruits: 'Grocery',
  ration: 'Grocery',
  bigbasket: 'Grocery',
  blinkit: 'Grocery',
  zepto: 'Grocery',
  instamart: 'Grocery',

  // Smoking (NEW)
  cigarette: 'Smoking',
  sutta: 'Smoking',
  smoke: 'Smoking',
  vape: 'Smoking',
  gutkha: 'Smoking',
  tambaku: 'Smoking',
  hookah: 'Smoking',

  // Alcohol (NEW)
  daaru: 'Alcohol',
  beer: 'Alcohol',
  whiskey: 'Alcohol',
  vodka: 'Alcohol',
  wine: 'Alcohol',
  rum: 'Alcohol',
  bar: 'Alcohol',
  pub: 'Alcohol',
  drinks: 'Alcohol',
  theka: 'Alcohol',

  // Income
  salary: 'Income',
  income: 'Income',
  freelance: 'Income',
  bonus: 'Income',
  refund: 'Income',
  cashback: 'Income',
  got: 'Income',
  received: 'Income',
  earned: 'Income',
  mila: 'Income',
  mile: 'Income',
  credited: 'Income',
  collected: 'Income',
  won: 'Income',
  returned: 'Income',
  investor: 'Income',
  dividend: 'Income',
  profit: 'Income',
  interest: 'Income',
  commission: 'Income',
  reward: 'Income',
  stipend: 'Income',
  pension: 'Income',

  // Finance (Expenses)
  investment: 'Finance',
  emi: 'Finance',
  loan: 'Finance',
  insurance: 'Finance',
  sip: 'Finance',
  mutual: 'Finance',
  tax: 'Finance',
  gold: 'Finance',
  stocks: 'Finance',
  shares: 'Finance',

  // Outgoing (explicit expense markers)
  send: 'Others',
  sent: 'Others',
  diya: 'Others',
  diye: 'Others',
  bheja: 'Others',
  paid: 'Others',
  transfer: 'Others',
  given: 'Others',
};

/**
 * Income-indicating keywords
 */
const INCOME_KEYWORDS = [
  'salary', 'income', 'freelance', 'bonus', 'refund', 'cashback',
  'got', 'received', 'earned', 'mila', 'mile', 'credited', 'collected', 'won', 'returned',
  'investor', 'dividend', 'profit', 'interest', 'commission', 'reward', 'stipend', 'pension',
];

/**
 * Parse a natural language input string into transaction data.
 *
 * Supports formats like:
 *   "250 swiggy"
 *   "swiggy 250"
 *   "300"
 *   "salary 30000"
 *
 * @param {string} rawInput - The raw user input
 * @returns {{ amount, note, type, category } | { error: string }}
 */
function parseInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { error: 'Input is empty' };
  }

  const input = rawInput.trim();
  if (!input) {
    return { error: 'Input is empty' };
  }

  // Detect explicit '+' prefix → force income
  const hasIncomePrefix = /^\+/.test(input);
  const cleanedInput = hasIncomePrefix ? input.replace(/^\+\s*/, '') : input;

  // Extract the first number (supports decimals like 49.99)
  const numberMatch = cleanedInput.match(/(\d+(?:\.\d+)?)/);

  if (!numberMatch) {
    return { error: 'Amount missing' };
  }

  const amount = parseFloat(numberMatch[1]);

  // Extract note: everything except the number, cleaned up
  let note = cleanedInput
    .replace(numberMatch[0], '')
    .trim()
    .replace(/\s+/g, ' ');

  // Phase 5: Split Detection
  let splitWith = null;
  const splitMatch = note.match(/split with\s+([a-zA-Z0-9_]+)/i);
  if (splitMatch) {
    splitWith = splitMatch[1];
    note = note.replace(splitMatch[0], '').trim();
  }

  // Detect category from note keywords
  const noteLower = note.toLowerCase();
  const words = noteLower.split(/\s+/).filter(Boolean);

  let category = 'Others';
  for (const word of words) {
    if (CATEGORY_MAP[word]) {
      category = CATEGORY_MAP[word];
      break;
    }
  }

  // Detect type: income or expense
  // '+' prefix OR income keywords → income
  const isIncome = hasIncomePrefix || words.some(word => INCOME_KEYWORDS.includes(word));
  const type = isIncome ? 'income' : 'expense';

  // If forced income via '+', set category to Income if still Others
  if (hasIncomePrefix && category === 'Others') {
    category = 'Income';
  }

  return {
    amount,
    note: note || null,
    type,
    category,
    splitWith
  };
}

module.exports = { parseInput, CATEGORY_MAP, INCOME_KEYWORDS };
