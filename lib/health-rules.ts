// Positive guidance ("eat more / aim for") per condition. Keys are the canonical
// condition keys produced by normalizeConditions() in ./safety.
export const healthRules: Record<string, string[]> = {
  diabetes: ["low sugar", "high fiber", "balanced carbs"],
  ulcer: ["low spice", "soft meals", "avoid acidic foods"],
  gerd: ["low spice", "smaller meals", "avoid fatty and acidic foods"],
  hypertension: ["low salt", "vegetable-rich", "lean protein"],
  high_cholesterol: ["less oil", "grilled not fried", "oats, beans and more fish"],
  kidney_disease: ["low salt", "controlled protein portions", "plenty of water"],
  gout: ["plenty of water", "low-purine meals", "limit red meat"],
  anemia: ["iron-rich greens", "beans and lean meat", "vitamin C with meals"],
  pregnancy: ["well-cooked meals", "iron and folate-rich foods", "plenty of water"],
};
