/**
 * Match detected ingredients to Indigenous recipes dataset.
 * Returns recipes you can make, sorted by ingredient overlap.
 */
const path = require('path');
const fs = require('fs');

const DATA_PATH = path.join(__dirname, '..', 'data', 'indigenous-recipes.json');
let recipes = null;

function loadRecipes() {
  if (recipes) return recipes;
  try {
    recipes = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    recipes = [];
  }
  return recipes;
}

const SYNONYMS = {
  maize: ['corn'], corn: ['maize', 'cornmeal', 'tortilla', 'taco'],
  pumpkin: ['squash'], squash: ['pumpkin'],
  beef: ['meat', 'venison', 'game', 'bison', 'steak'],
  meat: ['beef', 'venison', 'game', 'bison', 'steak', 'chicken', 'pork', 'sausage'],
  game: ['meat', 'beef'], venison: ['meat', 'beef'], bison: ['meat', 'beef'],
  broth: ['soup'], soup: ['broth'], cornmeal: ['corn', 'flour'],
  lard: ['oil', 'fat'], fat: ['oil'], oil: ['fat', 'lard'],
  tortilla: ['taco', 'quesadilla', 'burrito'],
  taco: ['tortilla', 'quesadilla', 'burrito'],
  quesadilla: ['tortilla', 'taco', 'cheese'],
  burrito: ['tortilla', 'taco', 'bean'],
  lettuce: ['salad'], salad: ['lettuce', 'spinach', 'kale'],
  bread: ['toast', 'dough', 'biscuit'], toast: ['bread'],
  fish: ['salmon', 'tuna', 'seafood'], salmon: ['fish'], tuna: ['fish'],
  berry: ['blueberry', 'blackberry', 'raspberry', 'strawberry', 'cherry'],
  cream: ['milk', 'sour-cream'], cranberry: ['cherry', 'raspberry'],
};

function normalize(s) {
  return String(s).toLowerCase().trim().replace(/\s+/g, '-').replace(/_/g, '-');
}

function buildDetectedSet(detected) {
  const set = new Set();
  if (!Array.isArray(detected)) return set;
  for (const item of detected) {
    const name = typeof item === 'string' ? item : (item && item.label);
    if (name) set.add(normalize(name));
  }
  return set;
}

function recipeIngredientKeys(ing) {
  const n = normalize(ing);
  return SYNONYMS[n] ? [n, ...SYNONYMS[n]] : [n];
}

function hasIngredient(detectedSet, recipeIngredient) {
  return recipeIngredientKeys(recipeIngredient).some((k) => detectedSet.has(k));
}

function matchRecipes(detected, opts = {}) {
  const minScore = opts.minScore ?? 0.15;
  const maxResults = opts.maxResults ?? 16;
  const list = loadRecipes();
  const detectedSet = buildDetectedSet(detected);
  if (detectedSet.size === 0) return [];

  const scored = list.map((recipe) => {
    const ingredients = recipe.ingredients || [];
    const matched = ingredients.filter((ing) => hasIngredient(detectedSet, ing));
    const score = ingredients.length ? matched.length / ingredients.length : 0;
    return { recipe, score, matchedIngredients: matched };
  });

  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

module.exports = { loadRecipes, matchRecipes, buildDetectedSet };
