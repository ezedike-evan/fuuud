/**
 * Deterministic food-safety enforcement. Ported from the original FUUD Express
 * backend (backend/src/modules/ai/safety.js in the Fuuud-legacy repo).
 *
 * This runs AFTER the model speaks, so an unsafe meal is screened out whether
 * it came from a static plan or from the LLM. The safety guarantee is never
 * left to the model alone.
 */

const ALLERGEN_TOKENS: Record<string, string[]> = {
  peanut: ["peanut", "groundnut", "kuli kuli", "kulikuli"],
  tree_nut: ["cashew", "almond", "walnut", "hazelnut", "tiger nut", "tigernut"],
  dairy: ["milk", "yoghurt", "yogurt", "cheese", "butter", "cream", "custard"],
  egg: ["egg"],
  gluten: ["wheat", "bread", "toast", "semovita", "semo", "pasta", "spaghetti", "noodle", "flour"],
  fish: ["fish", "catfish", "titus", "mackerel", "sardine", "stockfish", "panla"],
  shellfish: ["prawn", "shrimp", "crab", "lobster", "periwinkle", "crayfish"],
  soy: ["soy", "soya", "soybean"],
  sesame: ["sesame", "beniseed", "benniseed"],
};

export const ALLERGEN_LABELS: Record<string, string> = {
  peanut: "Peanuts / groundnuts",
  tree_nut: "Tree nuts",
  dairy: "Dairy",
  egg: "Eggs",
  gluten: "Gluten / wheat",
  fish: "Fish",
  shellfish: "Shellfish",
  soy: "Soy",
  sesame: "Sesame",
};

const ALLERGY_SYNONYMS: Record<string, string> = {
  peanut: "peanut", peanuts: "peanut", groundnut: "peanut", groundnuts: "peanut",
  nut: "tree_nut", nuts: "tree_nut", treenut: "tree_nut", "tree nut": "tree_nut",
  "tree nuts": "tree_nut", cashew: "tree_nut", almond: "tree_nut", almonds: "tree_nut",
  dairy: "dairy", milk: "dairy", lactose: "dairy", cheese: "dairy",
  egg: "egg", eggs: "egg",
  gluten: "gluten", wheat: "gluten",
  fish: "fish",
  shellfish: "shellfish", prawn: "shellfish", prawns: "shellfish", shrimp: "shellfish",
  crab: "shellfish", crayfish: "shellfish",
  soy: "soy", soya: "soy", soybean: "soy",
  sesame: "sesame", beniseed: "sesame",
};

/*
 * Observances get the same deterministic treatment as allergens, not the
 * softer preference treatment. A religious rule the model quietly forgets is
 * as much a failure as a forgotten allergy, and prompt text alone has already
 * proved insufficient once today.
 */
const OBSERVANCE_TOKENS: Record<string, string[]> = {
  no_pork: ["pork", "bacon", "ham", "gammon", "lard", "pancetta", "chorizo"],
  no_alcohol: ["alcohol", "beer", "wine", "spirits", "rum", "brandy", "palm wine", "burukutu"],
  vegetarian: ["beef", "goat", "chicken", "turkey", "pork", "bacon", "ham", "meat", "suya", "shaki", "ponmo", "offal", "liver", "gizzard", "fish", "catfish", "titus", "stockfish", "prawn", "shrimp", "crayfish"],
  vegan: ["beef", "goat", "chicken", "turkey", "pork", "bacon", "ham", "meat", "suya", "shaki", "ponmo", "offal", "liver", "gizzard", "fish", "catfish", "titus", "stockfish", "prawn", "shrimp", "crayfish", "milk", "cheese", "butter", "yoghurt", "yogurt", "egg", "honey"],
};

const OBSERVANCE_LABELS: Record<string, string> = {
  no_pork: "No pork",
  no_alcohol: "No alcohol",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
};

const OBSERVANCE_SYNONYMS: Record<string, string> = {
  "no pork": "no_pork", pork: "no_pork", halal: "no_pork", kosher: "no_pork",
  "no alcohol": "no_alcohol", alcohol: "no_alcohol", teetotal: "no_alcohol",
  vegetarian: "vegetarian", veggie: "vegetarian",
  vegan: "vegan", "plant based": "vegan", "plant-based": "vegan",
};

const CONDITION_BLOCK_TOKENS: Record<string, string[]> = {
  diabetes: ["sugar", "sugary", "sweetened", "soft drink", "soda", "candy", "cake", "honey", "malt drink", "ice cream", "syrup", "glucose", "condensed milk"],
  ulcer: ["pepper soup", "spicy", "chilli", "chili", "hot pepper", "alcohol", "carbonated", "soda", "coffee", "citrus"],
  gerd: ["pepper soup", "spicy", "chilli", "chili", "hot pepper", "fried", "deep-fried", "fatty", "chocolate", "mint", "coffee", "alcohol", "carbonated", "soda", "citrus", "tomato sauce"],
  hypertension: ["salt", "salty", "seasoning cube", "bouillon", "maggi", "processed meat", "sausage", "bacon", "canned", "instant noodle"],
  high_cholesterol: ["palm oil", "deep-fried", "fried", "butter", "lard", "organ meat", "liver", "offal", "kidney", "gizzard", "fatty meat", "pork", "full cream", "ice cream", "trans fat"],
  kidney_disease: ["salt", "salty", "seasoning cube", "bouillon", "maggi", "processed meat", "sausage", "bacon", "canned", "instant noodle", "organ meat", "offal"],
  gout: ["organ meat", "liver", "offal", "kidney", "gizzard", "sardine", "anchovy", "shellfish", "prawn", "shrimp", "crab", "crayfish", "red meat", "beer", "alcohol"],
  // Insomnia is not a food allergy, but it is one of the conditions where what
  // and when you eat genuinely matters, and it was missing entirely.
  insomnia: ["coffee", "caffeine", "espresso", "energy drink", "cola", "green tea", "black tea", "chocolate", "alcohol"],
  pregnancy: ["alcohol", "raw", "undercooked", "unpasteurized", "unpasteurised", "soft cheese", "pate", "liver", "swordfish", "shark", "king mackerel", "smoked fish"],
};

const CONDITION_AVOID_LABELS: Record<string, string[]> = {
  diabetes: ["Sugary drinks", "Sweets, cakes and syrups", "Large refined-carb portions"],
  ulcer: ["Very spicy / pepper-heavy meals", "Acidic and citrus drinks", "Alcohol, coffee and carbonated drinks"],
  gerd: ["Spicy and fried foods", "Citrus, tomato and carbonated drinks", "Chocolate, mint, coffee and alcohol"],
  hypertension: ["Excess salt", "Seasoning cubes / bouillon", "Processed and cured meats"],
  high_cholesterol: ["Deep-fried foods and excess palm oil", "Organ meats and fatty cuts", "Butter, cream and trans fats"],
  kidney_disease: ["Excess salt and seasoning cubes", "Processed and cured meats", "Organ meats"],
  gout: ["Organ meats and red meat", "Shellfish and oily fish", "Beer and alcohol"],
  insomnia: ["Coffee, tea and energy drinks, especially after midday", "Alcohol close to bedtime", "Heavy, fatty or very spicy meals late in the evening"],
  pregnancy: ["Alcohol", "Raw or undercooked foods", "Unpasteurised dairy and high-mercury fish"],
};

export const CONDITION_LABELS: Record<string, string> = {
  diabetes: "diabetes",
  ulcer: "ulcer",
  gerd: "GERD / acid reflux",
  hypertension: "hypertension",
  high_cholesterol: "high cholesterol",
  kidney_disease: "kidney disease",
  gout: "gout",
  pregnancy: "pregnancy",
  anemia: "anemia",
  insomnia: "insomnia",
};

const CONDITION_SYNONYMS: Record<string, string> = {
  diabetes: "diabetes", diabetic: "diabetes", "type 2 diabetes": "diabetes", "type-2 diabetes": "diabetes", sugar: "diabetes",
  ulcer: "ulcer", "peptic ulcer": "ulcer", "stomach ulcer": "ulcer",
  gerd: "gerd", "acid reflux": "gerd", reflux: "gerd", heartburn: "gerd",
  hypertension: "hypertension", "high blood pressure": "hypertension", "high bp": "hypertension", hbp: "hypertension",
  "high cholesterol": "high_cholesterol", cholesterol: "high_cholesterol", dyslipidemia: "high_cholesterol", dyslipidaemia: "high_cholesterol",
  "kidney disease": "kidney_disease", kidney: "kidney_disease", ckd: "kidney_disease", renal: "kidney_disease", "renal disease": "kidney_disease",
  gout: "gout",
  anemia: "anemia", anaemia: "anemia", "low iron": "anemia", "iron deficiency": "anemia",
  pregnancy: "pregnancy", pregnant: "pregnancy",
  insomnia: "insomnia", insomniac: "insomnia", "trouble sleeping": "insomnia",
  "can't sleep": "insomnia", "cannot sleep": "insomnia", "sleeplessness": "insomnia",
};

// Phrases that contain an allergen token but are NOT that allergen.
const FALSE_POSITIVE_PHRASES = ["garden egg", "garden eggs", "eggplant", "sweet potato"];

export type HealthProfile = {
  conditions?: string[];
  allergies?: string[];
  /** Standing preferences. Shape suggestions; never a safety rule. */
  dislikes?: string[];
  /** Foods they actively like. The reason a plan is worth following. */
  likes?: string[];
  /** Dietary aims they are working toward — "cutting back on sugar". */
  goals?: string[];
  /** Religious or fasting rules. Enforced like allergens, not like tastes. */
  observances?: string[];
  /** Who they cook for — changes portions, may add a second person's rules. */
  household?: string[];
  /** Budget, time, equipment, skill. Why good advice goes unfollowed. */
  practical?: string[];
  /** They explicitly told us they have no allergies / no conditions. */
  cleared?: boolean;
};

/**
 * Do we actually know this person's allergy status?
 *
 * "No allergies recalled" is NOT the same as "no allergies". Until they have
 * either named one or explicitly said they have none, the honest answer is
 * that we do not know — and an agent that suggests a meal in that state is
 * guessing with someone's airway.
 */
export function allergyStatusKnown(profile: HealthProfile = {}) {
  return Boolean(profile.cleared) || normalizeList(profile.allergies).length > 0;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeList(value: string[] | string | undefined | null): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map((v) => v.trim()).filter(Boolean);
}

/**
 * Facts come out of memory as the person phrased them — "type 2 diabetes,
 * diagnosed 2024", not the bare synonym key. An exact-match-only lookup would
 * quietly return the raw string, which matches no block list, and the whole
 * screen would pass a meal it should have stopped. So: exact match first, then
 * look for a known term inside the claim.
 */
function matchTerms(value: string, synonyms: Record<string, string>): string[] {
  const exact = synonyms[value];
  if (exact) return [exact];
  const found = new Set<string>();
  for (const [term, key] of Object.entries(synonyms)) {
    // Word boundaries keep "nut" out of "groundnut" and "peanut".
    if (new RegExp(`\\b${escapeRegex(term)}\\b`).test(value)) found.add(key);
  }
  return [...found];
}

export function normalizeConditions(list: string[] | string | undefined): string[] {
  const keys = new Set<string>();
  for (const raw of normalizeList(list)) {
    const value = raw.toLowerCase().trim();
    const matched = matchTerms(value, CONDITION_SYNONYMS);
    // Unrecognised conditions are kept verbatim so callers can still show them.
    if (matched.length) matched.forEach((k) => keys.add(k));
    else keys.add(value);
  }
  return [...keys];
}

// Strip known false-positive phrases, then word-boundary match each token so
// "garden egg" doesn't trip the "egg" rule and "sweet potato" doesn't trip "sugar".
function normalizeHaystack(text: string) {
  let haystack = ` ${String(text ?? "").toLowerCase()} `;
  for (const phrase of FALSE_POSITIVE_PHRASES) {
    haystack = haystack.split(phrase).join(" ");
  }
  return haystack;
}

export function findFlags(text: string, tokens: string[]): string[] {
  const haystack = normalizeHaystack(text);
  const found = new Set<string>();
  for (const token of tokens) {
    if (new RegExp(`\\b${escapeRegex(token)}s?\\b`, "i").test(haystack)) found.add(token);
  }
  return [...found];
}

/** Stored observances ("halal", "no pork") to canonical keys. */
export function resolveObservances(list: string[]): string[] {
  const keys = new Set<string>();
  for (const raw of list) {
    for (const key of matchTerms(raw.toLowerCase().trim(), OBSERVANCE_SYNONYMS)) keys.add(key);
  }
  return [...keys];
}

export function resolveAllergens(allergyList: string[]): string[] {
  const keys = new Set<string>();
  for (const raw of allergyList) {
    // Stored allergies carry the reaction too ("groundnuts - hives"), so this
    // must find the allergen inside the claim, not demand the claim BE one.
    const value = raw.toLowerCase().trim();
    if (/\bseafood\b/.test(value)) { keys.add("fish"); keys.add("shellfish"); }
    for (const key of matchTerms(value, ALLERGY_SYNONYMS)) keys.add(key);
  }
  return [...keys];
}

export function buildBlocklist(profile: HealthProfile = {}) {
  const conditions = normalizeConditions(profile.conditions);
  const allergenKeys = resolveAllergens(normalizeList(profile.allergies));
  const observanceKeys = resolveObservances(normalizeList(profile.observances));
  const allergenTokens = allergenKeys.flatMap((k) => ALLERGEN_TOKENS[k] ?? []);
  const conditionTokens = conditions.flatMap((c) => CONDITION_BLOCK_TOKENS[c] ?? []);
  const observanceTokens = observanceKeys.flatMap((k) => OBSERVANCE_TOKENS[k] ?? []);
  return { conditions, allergenKeys, allergenTokens, conditionTokens, observanceKeys, observanceTokens };
}

/** Hard constraints folded into the system prompt — defence in depth, before screening. */
export function buildSafetyConstraintsText(profile: HealthProfile) {
  const { allergenKeys, conditions } = buildBlocklist(profile);
  const lines = ["HARD SAFETY CONSTRAINTS - every meal must comply:"];

  /*
   * EVERYTHING THEY TOLD US GOES IN, VERBATIM, FIRST.
   *
   * The blocklists below are keyed off hardcoded synonym tables, so anything
   * outside them used to be dropped in silence: "asthma" and a mango allergy
   * produced an EMPTY constraints block, and the agent went on to suggest
   * meals as though neither had been mentioned. The tables are a deterministic
   * safety net for the allergens common in Nigerian cooking — they are not the
   * set of things a person is allowed to have.
   *
   * So state the raw claims regardless, then add the mechanical detail for the
   * ones the tables do cover.
   */
  const statedAllergies = normalizeList(profile.allergies);
  const statedConditions = normalizeList(profile.conditions);

  if (statedAllergies.length) {
    lines.push(
      `- They have told you they are allergic to: ${statedAllergies.join("; ")}. Never serve any of these, or any dish containing them, in any amount.`,
    );
  }
  const statedObservances = normalizeList(profile.observances);
  if (statedObservances.length) {
    lines.push(
      `- They keep these rules: ${statedObservances.join("; ")}. Treat them exactly as strictly as an allergy. Never serve anything that breaks one, and never offer a "just this once" version.`,
    );
  }
  if (statedConditions.length) {
    lines.push(
      `- They have told you they have: ${statedConditions.join("; ")}. Every meal must be appropriate for all of them, and say the guidance is not medical advice.`,
    );
  }

  if (allergenKeys.length) {
    lines.push(`- Never include these allergens or any dish containing them: ${allergenKeys.map((k) => ALLERGEN_LABELS[k] ?? k).join(", ")}.`);
  }
  for (const condition of conditions) {
    const avoid = CONDITION_AVOID_LABELS[condition];
    if (avoid) lines.push(`- For ${CONDITION_LABELS[condition] ?? condition}, avoid: ${avoid.join(", ")}.`);
  }

  /*
   * Name the gap out loud. An allergen with no token list is not screened by
   * screenReply() after the fact, so the model is the only thing standing
   * between the person and that ingredient. It should know that.
   */
  const { observanceKeys } = buildBlocklist(profile);
  if (observanceKeys.length) {
    lines.push(`- Never include anything that breaks: ${observanceKeys.map((k) => OBSERVANCE_LABELS[k] ?? k).join(", ")}.`);
  }

  const unscreened = statedAllergies.filter((a) => resolveAllergens([a]).length === 0);
  if (unscreened.length) {
    lines.push(
      `- No automatic ingredient check exists for: ${unscreened.join("; ")}. Nothing downstream will catch a mistake here, so check every dish yourself before you name it.`,
    );
  }

  /*
   * The gate. Previously an unknown profile fell through to "keep meals
   * balanced, mild and vegetable-forward" — which reads as permission to plan
   * a full day of meals for someone whose allergies nobody has asked about,
   * and bakes in a vegetable bias nobody requested. An empty profile is a
   * question to ask, not a default to apply.
   */
  if (!allergyStatusKnown(profile)) {
    lines.push(
      "- You DO NOT KNOW this person's allergies or conditions yet. Do not name a single specific dish, meal or menu until you do.",
      "- Ask them, in one short question, what allergies and medical conditions you should know about. Tell them they only have to say it once.",
      "- If they say they have none, accept that and go on to suggest food.",
    );
  } else if (profile.cleared && !allergenKeys.length) {
    lines.push("- They have told you they have no known allergies. Do not keep asking.");
  }

  /*
   * Preferences come AFTER the safety lines and are marked as preferences, so
   * nothing here can be mistaken for a hard rule. They are not decoration: a
   * plan built only from prohibitions is inoffensive and unappealing, and
   * nobody follows it.
   */
  const dislikes = normalizeList(profile.dislikes);
  const likes = normalizeList(profile.likes);
  const goals = normalizeList(profile.goals);

  if (likes.length) {
    lines.push(`- They like: ${likes.join("; ")}. Build meals around these where the constraints allow it, rather than merely avoiding what they cannot have.`);
  }
  if (goals.length) {
    lines.push(`- They are working toward: ${goals.join("; ")}. Respect this in every meal, and do not talk them out of it.`);
  }
  if (dislikes.length) {
    lines.push(
      `- They dislike: ${dislikes.join("; ")}. Work around it rather than serving it and hoping. Do not hide a disliked food inside a dish and present it as a solution.`,
    );
  }
  const household = normalizeList(profile.household);
  const practical = normalizeList(profile.practical);
  if (household.length) {
    lines.push(`- They cook for: ${household.join("; ")}. Size the meal accordingly, and respect anyone else's stated rules.`);
  }
  if (practical.length) {
    lines.push(`- What they can actually manage: ${practical.join("; ")}. A meal they cannot afford or cannot cook is not a suggestion, it is a dead end. Stay inside this.`);
  }

  if (dislikes.length || likes.length || goals.length || household.length || practical.length) {
    lines.push("- Likes, dislikes, goals, household and budget are preferences and limits, not safety rules: they never override an allergy, a condition or an observance, and they are never a reason to call a meal unsafe.");
  }

  return lines.join("\n");
}

/**
 * Screen generated text against the profile. Returns the violations found so
 * the caller can regenerate rather than ship an unsafe suggestion.
 */
export function screenReply(text: string, profile: HealthProfile) {
  const { allergenTokens, conditionTokens, observanceTokens } = buildBlocklist(profile);
  const allergenFlags = findFlags(text, allergenTokens);
  const conditionFlags = findFlags(text, conditionTokens);
  const observanceFlags = findFlags(text, observanceTokens);
  return {
    safe: allergenFlags.length === 0 && conditionFlags.length === 0 && observanceFlags.length === 0,
    allergenFlags,
    conditionFlags,
    observanceFlags,
  };
}
