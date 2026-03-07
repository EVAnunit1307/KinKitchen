const FOOD_LABELS = new Set([
  'apple', 'apricot', 'artichoke', 'asparagus', 'avocado', 'bacon', 'bagel', 'baking-powder', 'banana',
  'basil', 'bean', 'beef', 'beet', 'biscuit', 'blackberry', 'blueberry', 'bread', 'broccoli', 'burrito',
  'butter', 'cabbage', 'cake', 'candy', 'cantaloupe', 'carrot', 'cauliflower', 'celery', 'cheese',
  'cherry', 'chicken', 'chili', 'chive', 'chocolate', 'cilantro', 'cinnamon', 'coconut', 'condiment',
  'cookie', 'courgette', 'crab', 'crape', 'cream', 'cucumber', 'curry', 'custard', 'dill', 'donut',
  'dough', 'dressing', 'egg', 'eggplant', 'fish', 'flour', 'garlic', 'ginger', 'grape', 'grapefruit',
  'grits', 'guacamole', 'ham', 'honey', 'hot-dog', 'ice-cream', 'jam', 'jelly', 'kale', 'ketchup',
  'kiwi', 'lamb', 'leek', 'lemon', 'lettuce', 'lime', 'lobster', 'mango', 'maple-syrup', 'marshmallow',
  'mayonnaise', 'meat', 'melon', 'milk', 'mint', 'mushroom', 'mustard', 'noodle', 'nut', 'oatmeal',
  'oil', 'olive', 'onion', 'orange', 'oregano', 'pancake', 'pasta', 'pastry', 'pea', 'peach', 'pear',
  'pepper', 'pickle', 'pie', 'pimento', 'pineapple', 'pita', 'pizza', 'plum', 'pomegranate', 'pork',
  'potato', 'poultry', 'pudding', 'pumpkin', 'quesadilla', 'radish', 'raisin', 'raspberry', 'relish',
  'rice', 'rosemary', 'rum', 'salad', 'salmon', 'salsa', 'salt', 'sandwich', 'sauce', 'sausage',
  'scallop', 'seafood', 'sesame', 'shallot', 'soup', 'sour-cream', 'soy-sauce', 'spinach', 'squash',
  'steak', 'strawberry', 'sugar', 'sushi', 'sweet-potato', 'taco', 'tarragon', 'tea', 'thyme', 'toast',
  'tofu', 'tomato', 'tortilla', 'tuna', 'turkey', 'turnip', 'vanilla', 'vinegar', 'waffle', 'walnut',
  'watermelon', 'wine', 'yogurt', 'zucchini',
]);

const MIN_CONFIDENCE = 0.6;

function normalizeLabel(label) {
  return String(label).toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
}

function isFoodLabel(label) {
  return FOOD_LABELS.has(normalizeLabel(label));
}

module.exports = { FOOD_LABELS, MIN_CONFIDENCE, normalizeLabel, isFoodLabel };