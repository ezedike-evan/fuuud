/**
 * Allergen guides: where an allergen commonly turns up in everyday Nigerian food, what to
 * ask, and how to tell Fuuud once. Content is deliberately hedged ("often", "can", "check"):
 * recipes differ by cook, region and brand, and this is a reading aid, not medical advice.
 * Every page repeats that and points to a clinician.
 *
 * Plain data, no imports: the pages, the sitemap and the tests all read this one file.
 */

export type Allergen = {
  slug: string;
  name: string;
  /** Used in the title; keep title + " · Fuuud" within 60 characters. */
  title: string;
  description: string;
  intro: string;
  hides: { food: string; note: string }[];
  safer: string[];
  ask: string[];
  /** What to say to Fuuud, shown as an example it would store. */
  tellFuuud: { say: string; stored: string };
  faq: { q: string; a: string }[];
  /** Foods in this guide that commonly need a second look for a related allergen. */
  related: string[];
  updated: string;
};

export const ALLERGENS: Allergen[] = [
  {
    slug: "groundnut",
    name: "groundnut (peanut)",
    title: "Groundnut allergy: Nigerian foods to check",
    description: "Where groundnut often hides in Nigerian food, from suya spice to soups, what to ask a vendor, and how to tell Fuuud once.",
    intro:
      "Groundnut is one of the most common food allergens, and in Nigerian cooking it is often an ingredient you cannot see. It is ground into spice mixes, used to thicken soups and pressed into frying oil. If you react to groundnut, the useful habit is to ask what is in the mix, not only what is on the plate.",
    hides: [
      { food: "Suya and kilishi", note: "The dry spice rub (yaji) is commonly built on ground groundnut or kuli-kuli. Plain grilled meat can still pick it up from a shared tray, knife or foil." },
      { food: "Kuli-kuli and roasted groundnut", note: "Sold at roadsides and in snack bags, often next to products that are not labelled." },
      { food: "Groundnut soup and sauces", note: "Some northern soups and stews use ground groundnut as the thickener." },
      { food: "Kunun gyada and similar drinks", note: "Gruels and drinks made with groundnut paste." },
      { food: "Fried snacks", note: "Frying oil can be groundnut oil. Refined oil is generally lower risk than pressed oil, but do not assume, ask." },
      { food: "Seasoning blends", note: "Homemade or market spice blends sold loose rarely list ingredients." },
    ],
    safer: [
      "Pepper, salt and onion on grilled meat instead of yaji, cooked on a clean surface.",
      "Egusi (melon seed) or ogbono to thicken a soup instead of groundnut.",
      "Rice, yam, plantain and beans cooked at home in palm or vegetable oil you have checked.",
    ],
    ask: [
      "Does the spice mix or rub contain groundnut or kuli-kuli?",
      "Is the meat grilled on the same surface or foil as spiced meat?",
      "What oil is used for frying, and is anything else fried in it?",
    ],
    tellFuuud: { say: "I'm allergic to groundnuts, they give me hives", stored: "2026-10-07 | allergy | groundnuts - hives" },
    faq: [
      { q: "Is groundnut oil safe if I am allergic?", a: "It depends on how the oil is made and on how sensitive you are. Highly refined oil is often tolerated, pressed or unrefined oil often is not. Ask your clinician and do not rely on the label alone." },
      { q: "Is suya without spice safe?", a: "Plain grilled meat removes the main source, but cross-contact on shared surfaces is common. Say it is an allergy, not a preference." },
    ],
    related: ["Suya spice can also contain other seeds and nuts. Ask what is in it."],
    updated: "2026-10-07",
  },
  {
    slug: "egg",
    name: "egg",
    title: "Egg allergy: Nigerian foods to check",
    description: "Where egg often appears in Nigerian food, from moi moi to chin chin, plus swaps, questions to ask and how to tell Fuuud once.",
    intro:
      "Egg shows up in more Nigerian food than people expect, both as a visible ingredient and as a binder or glaze. Because many snacks and baked goods are made by hand without a label, the way to stay safe is to know the usual suspects and ask.",
    hides: [
      { food: "Moi moi", note: "A boiled egg is a common addition, and some cooks add raw egg to the batter. Plain bean batter without egg exists, so ask." },
      { food: "Chin chin, buns and doughnuts", note: "Often made with egg in the dough." },
      { food: "Puff-puff and pancakes", note: "Recipes vary. Some use egg, some do not." },
      { food: "Meat pie and sausage roll", note: "The golden glaze is frequently egg wash." },
      { food: "Fried rice and salads", note: "Egg is often mixed in or on top, and Nigerian salad commonly includes boiled egg and a mayonnaise-style dressing." },
      { food: "Sauces and spreads", note: "Mayonnaise and salad cream contain egg." },
      { food: "Scotch eggs, egg rolls and egg sandwiches", note: "Egg is the point of these, and the coating or filling is often bound with more egg." },
      { food: "Cakes, doughnuts and small chops", note: "Party snacks are usually made in bulk by hand, so ingredients are rarely listed. Ask the person who made them, not the person serving." },
    ],
    safer: [
      "Akara and plain beans, checked that no egg was added.",
      "Jollof rice, boiled or roasted plantain, yam or plain rice with stew.",
      "Home-baked snacks where you control the recipe.",
    ],
    ask: [
      "Is there egg in the batter or dough, or only on top?",
      "Is the glaze on the pastry egg wash?",
      "Is the dressing mayonnaise or salad cream?",
    ],
    tellFuuud: { say: "I can't eat eggs, even in baked things", stored: "2026-10-07 | allergy | eggs, including baked goods" },
    faq: [
      { q: "Is moi moi safe with an egg allergy?", a: "Only if it is made without egg. Many versions include a boiled egg, and some add raw egg to the batter. Ask how it was made, or cook it yourself." },
      { q: "Can I have akara?", a: "Akara is traditionally bean paste fried in oil, usually without egg, but check the recipe and what else is fried in the same oil." },
      { q: "Does egg wash on pastry matter?", a: "Yes. Even when the filling is egg-free, the shiny glaze on meat pies and sausage rolls is commonly egg. If you are strictly avoiding egg, ask about the glaze." },
    ],
    related: ["Baked goods may also contain milk or wheat. Check each allergen you have."],
    updated: "2026-10-07",
  },
  {
    slug: "milk",
    name: "milk",
    title: "Milk allergy: Nigerian foods to check",
    description: "Where milk turns up in Nigerian food and drinks, how it differs from lactose intolerance, and how to tell Fuuud once.",
    intro:
      "Milk is easy to miss when it arrives as a powder, in a hot drink or in a baked snack. A milk allergy is different from lactose intolerance: the first is an immune reaction, the second is about digesting milk sugar, and the advice for each is not the same. Tell Fuuud which one you have.",
    hides: [
      { food: "Pap (ogi, akamu) and custard", note: "Usually served with milk and sugar, often evaporated or powdered milk." },
      { food: "Tea and hot drinks", note: "Milk powder or evaporated milk is added by default in many places." },
      { food: "Nono, fura da nono and yoghurt", note: "Fermented milk drinks and products." },
      { food: "Wara", note: "Soft local cheese, made from milk." },
      { food: "Bread, buns and chin chin", note: "Milk powder is a common ingredient in dough." },
      { food: "Ice cream, creamy sauces and some stews", note: "Cream or milk is sometimes used to finish a dish." },
      { food: "Cereals, oats and instant mixes", note: "Breakfast cereals, instant oats and drink powders often contain milk solids. The pack will say, so read it before you add anything." },
      { food: "Cakes, puff-puff mixes and party snacks", note: "Made in bulk and rarely labelled. Powdered milk is a common ingredient in the dough, so ask the person who made it." },
    ],
    safer: [
      "Pap made with water, with sugar or honey to taste, if you have no other allergy to worry about.",
      "Plant drinks such as oat or soy, if soy and the other ingredients suit you.",
      "Plain rice, yam, beans, plantain and stews made with oil.",
    ],
    ask: [
      "Is milk powder or evaporated milk added to this?",
      "Does the bread or snack list milk, or can you check the pack?",
      "Is it made with butter or cream?",
    ],
    tellFuuud: { say: "I'm allergic to cow's milk, not just lactose", stored: "2026-10-07 | allergy | cow's milk (allergy, not lactose intolerance)" },
    faq: [
      { q: "Is lactose-free milk safe if I am allergic to milk?", a: "No. Lactose-free milk still contains milk protein. Allergy needs a different approach from intolerance." },
      { q: "Does butter count?", a: "Butter contains small amounts of milk protein, so for an allergy treat it as milk unless your clinician says otherwise." },
      { q: "What about goat or camel milk?", a: "The proteins are similar enough that people allergic to cow's milk often react to them too. Do not switch without your clinician's advice." },
    ],
    related: ["Many packaged snacks that contain milk also contain wheat or egg."],
    updated: "2026-10-07",
  },
  {
    slug: "fish-shellfish",
    name: "fish and shellfish",
    title: "Fish and shellfish allergy: foods to check",
    description: "Crayfish, dried fish and seasoning cubes are in many Nigerian soups and stews. Where to look, what to ask, and how to tell Fuuud once.",
    intro:
      "In Nigerian cooking, fish and crayfish are usually a flavour base, not a feature. They go into the pot of egusi, ogbono, afang and pepper soup, into stews and rice, and into seasoning cubes. That makes a fish or shellfish allergy hard to see from the outside of a dish.",
    hides: [
      { food: "Ground crayfish", note: "A common seasoning in soups, stews, jollof and sauces. Crayfish is a crustacean." },
      { food: "Dried and smoked fish, stockfish and bonga", note: "Used to flavour soups and stews, often broken up so it is hard to spot." },
      { food: "Seasoning cubes and powders", note: "Some contain fish or crayfish. Read the label for fish, crayfish or shrimp." },
      { food: "Moi moi", note: "Often made with fish or sardine folded into the batter." },
      { food: "Pepper soup and fresh fish stew", note: "Fish or other seafood is the main ingredient." },
      { food: "Soups with periwinkle or snails", note: "Some people with shellfish allergy also react to molluscs. This differs between people, so ask your clinician." },
      { food: "Fried rice, jollof and white rice with stew", note: "Prawns or crayfish can be stirred in, and the stew served over plain rice is usually made on a fish or crayfish base. The rice looks safe even when the sauce is not." },
      { food: "Street food and buka plates", note: "Pots and ladles are shared between dishes, so a vegetable soup can carry fish from the pot next to it. Say it is an allergy and ask what shares the pot." },
    ],
    safer: [
      "Soups and stews made without crayfish or dried fish, flavoured with locust beans (iru), onion and pepper instead.",
      "Plain jollof, yam, plantain, beans and rice cooked with seasoning you have checked.",
      "Meat or egg dishes, if those suit you.",
    ],
    ask: [
      "Is there crayfish or dried fish in the soup base or stew?",
      "Does the seasoning contain fish or crayfish?",
      "Is the pot or oil shared with fish dishes?",
    ],
    tellFuuud: { say: "I'm allergic to shellfish and crayfish", stored: "2026-10-07 | allergy | shellfish, including crayfish" },
    faq: [
      { q: "Is fish allergy the same as shellfish allergy?", a: "No. Fish and shellfish are different groups and a person can be allergic to one without the other. Tell Fuuud exactly which you have." },
      { q: "Is crayfish a fish?", a: "No, crayfish is a crustacean, so it counts as shellfish, even though it is used like a seasoning in local cooking." },
      { q: "Can I trust a seasoning cube?", a: "Not without reading it. Some brands list fish or crayfish, and recipes change. If the pack is unlabelled or in a language you cannot read, leave it out." },
    ],
    related: ["Fish stock and seasoning can sit in dishes that look vegetarian."],
    updated: "2026-10-07",
  },
  {
    slug: "wheat-gluten",
    name: "wheat and gluten",
    title: "Wheat and gluten: Nigerian foods to check",
    description: "Which Nigerian foods contain wheat, which swallows and staples do not, and how to tell Fuuud once. Not medical advice.",
    intro:
      "Many Nigerian staples are naturally free of wheat, which helps. The wheat tends to be in bread, baked snacks, noodles and some swallows. Wheat allergy and coeliac disease are different conditions, and this page applies to both with the same caution: wheat flour and cross-contact are what to look for.",
    hides: [
      { food: "Bread, buns, doughnuts and meat pie", note: "Made with wheat flour." },
      { food: "Chin chin and puff-puff", note: "Typically made with wheat flour, and often fried in oil shared with other foods." },
      { food: "Semovita and wheat swallow", note: "Made from wheat, unlike eba, amala or pounded yam." },
      { food: "Noodles, pasta and macaroni", note: "Wheat-based unless the pack says otherwise." },
      { food: "Seasoning cubes, sauces and some stews", note: "Wheat can be used as a filler or thickener. Read the label." },
      { food: "Beer and some drinks", note: "Beer is commonly made from barley or wheat. Check drinks too." },
      { food: "Fried snacks and street food", note: "Anything battered or coated, such as fried yam with a flour dusting, fish rolled in flour, or snacks fried in oil shared with chin chin, can pick up wheat." },
      { food: "Pies, rolls and shawarma", note: "The pastry or bread is wheat, and the filling or sauce can be thickened with flour too." },
    ],
    safer: [
      "Naturally wheat-free staples: rice, yam, cassava (garri, fufu), plantain, beans, maize (pap, tuwo masara) and millet or sorghum dishes.",
      "Swallows made from yam flour or cassava, such as pounded yam, eba and amala, checked for mixed flours.",
      "Soups thickened with egusi or ogbono.",
    ],
    ask: [
      "Is this made with wheat flour or a wheat swallow?",
      "Is it fried in the same oil as flour-based snacks?",
      "Does the seasoning or sauce contain wheat?",
    ],
    tellFuuud: { say: "I have coeliac disease, so no wheat, barley or rye", stored: "2026-10-07 | condition | coeliac disease - avoid wheat, barley, rye" },
    faq: [
      { q: "Is pounded yam safe for a gluten-free diet?", a: "Pounded yam made from yam alone has no gluten. Some instant flours are blended, so check the pack." },
      { q: "Are millet and sorghum gluten-free?", a: "They do not contain gluten naturally, but they can be milled next to wheat. For coeliac disease, ask about cross-contact." },
      { q: "Is wheat allergy the same as coeliac disease?", a: "No. Wheat allergy is an immune reaction to wheat proteins. Coeliac disease is an autoimmune reaction to gluten, which is also in barley and rye. The foods to avoid overlap, but your clinician decides which applies to you." },
    ],
    related: ["Baked goods with wheat often contain egg and milk as well."],
    updated: "2026-10-07",
  },
];

export const allergenBySlug = (slug: string) => ALLERGENS.find((a) => a.slug === slug);
