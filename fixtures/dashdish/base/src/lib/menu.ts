// DashDish demo catalogue. Deterministic data: no network, no backend.

export type ArtKey = "pizza" | "ramen" | "bowl" | "burger" | "sushi" | "tacos" | "dessert" | "salad" | "dumplings" | "pasta" | "smoothie" | "fries";

export interface Dish {
  id: string;
  name: string;
  description: string;
  /** Price in integer cents. */
  price: number;
  art: ArtKey;
  kcal: number;
  popular?: boolean;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  art: ArtKey;
  rating: number;
  reviews: string;
  eta: string;
  fee: number;
  tint: string;
  dishes: Dish[];
}

export const CATEGORIES: Array<{ label: string; art: ArtKey }> = [
  { label: "Pizza", art: "pizza" },
  { label: "Ramen", art: "ramen" },
  { label: "Bowls", art: "bowl" },
  { label: "Burgers", art: "burger" },
  { label: "Sushi", art: "sushi" },
  { label: "Dessert", art: "dessert" },
];

export const RESTAURANTS: Restaurant[] = [
  {
    id: "ember",
    name: "Ember & Crust",
    cuisine: "Wood-fired pizza",
    art: "pizza",
    rating: 4.9,
    reviews: "2.3k",
    eta: "25–30 min",
    fee: 199,
    tint: "#3a1d14",
    dishes: [
      { id: "margherita", name: "Wood-fired Margherita", description: "San Marzano tomato, fior di latte, basil, olive oil.", price: 1450, art: "pizza", kcal: 820, popular: true },
      { id: "garden-pasta", name: "Garden Rigatoni", description: "Blistered tomato, basil pesto, pecorino.", price: 1290, art: "pasta", kcal: 690 },
      { id: "caesar", name: "Charred Caesar", description: "Little gem, parmesan, sourdough crumbs.", price: 990, art: "salad", kcal: 410 },
      { id: "tiramisu", name: "Espresso Tiramisu", description: "Mascarpone, cocoa, savoiardi.", price: 750, art: "dessert", kcal: 460 },
    ],
  },
  {
    id: "koji",
    name: "Kōji Ramen Bar",
    cuisine: "Ramen & small plates",
    art: "ramen",
    rating: 4.8,
    reviews: "1.8k",
    eta: "20–25 min",
    fee: 149,
    tint: "#2b1a0f",
    dishes: [
      { id: "shoyu", name: "Shoyu Ramen", description: "Chicken broth, soy tare, ajitama egg, nori.", price: 1350, art: "ramen", kcal: 740, popular: true },
      { id: "gyoza", name: "Crispy Gyoza", description: "Pork and cabbage, chilli vinegar.", price: 790, art: "dumplings", kcal: 380 },
    ],
  },
  {
    id: "verde",
    name: "Verde Bowls",
    cuisine: "Grain bowls & salads",
    art: "bowl",
    rating: 4.7,
    reviews: "960",
    eta: "15–20 min",
    fee: 99,
    tint: "#14281c",
    dishes: [
      { id: "harvest", name: "Harvest Bowl", description: "Farro, roast squash, avocado, tahini.", price: 1190, art: "bowl", kcal: 560, popular: true },
      { id: "berry", name: "Berry Smoothie", description: "Mixed berries, banana, oat milk.", price: 590, art: "smoothie", kcal: 240 },
    ],
  },
  {
    id: "smash",
    name: "Smash Social",
    cuisine: "Burgers & fries",
    art: "burger",
    rating: 4.6,
    reviews: "3.1k",
    eta: "25–35 min",
    fee: 199,
    tint: "#2e1c10",
    dishes: [
      { id: "double", name: "Double Smash", description: "Two patties, American cheese, pickles.", price: 1390, art: "burger", kcal: 980, popular: true },
      { id: "fries", name: "Rosemary Fries", description: "Sea salt, garlic aioli.", price: 490, art: "fries", kcal: 420 },
    ],
  },
];

export function restaurantById(id: string): Restaurant | undefined {
  return RESTAURANTS.find((r) => r.id === id);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
