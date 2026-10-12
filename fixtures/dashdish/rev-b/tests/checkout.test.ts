import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RESTAURANTS } from "../src/lib/menu.ts";
import { addToCart, cartTotals, normalizeCoupon } from "../src/lib/cart.ts";
import { placeOrder, resultHeadline } from "../src/lib/checkout.ts";

const ember = RESTAURANTS[0];
const margherita = ember.dishes[0];
const tiramisu = ember.dishes[3];

describe("ordering", () => {
  it("adds food to the cart", () => {
    let cart = addToCart([], margherita, ember.id);
    cart = addToCart(cart, margherita, ember.id);
    cart = addToCart(cart, tiramisu, ember.id);
    assert.equal(cart.length, 2);
    assert.equal(cartTotals(cart, ember.fee, null).subtotal, 2 * 1450 + 750);
  });

  it("applies a coupon to the total", () => {
    const cart = addToCart([], margherita, ember.id);
    const coupon = normalizeCoupon(" welcome10 ");
    assert.equal(coupon, "WELCOME10");
    assert.equal(cartTotals(cart, ember.fee, coupon).total, 1450 + 199 - 145);
  });

  it("customizes a dish with a size and add-ons", () => {
    const cart = addToCart([], margherita, ember.id, 1, { size: "large", addOns: ["cheese"] });
    assert.equal(cart[0].price, 1450 + 300 + 150);
    assert.equal(cart[0].options, "Large · Extra cheese");
    const more = addToCart(cart, margherita, ember.id);
    assert.equal(more.length, 2);
  });

  it("completes a regular checkout", () => {
    const lines = addToCart([], margherita, ember.id);
    const result = placeOrder({ lines, coupon: null, deliveryFee: ember.fee, address: "12 Market Street", eta: ember.eta, delivery: { type: "now" } });
    assert.equal(resultHeadline(result), "Order confirmed");
  });

  it("schedules an order for tomorrow", () => {
    const lines = addToCart([], margherita, ember.id);
    const result = placeOrder({
      lines,
      coupon: null,
      deliveryFee: ember.fee,
      address: "12 Market Street",
      eta: ember.eta,
      delivery: { type: "scheduled", day: "Tomorrow", window: "18:00–19:00" },
    });
    assert.equal(resultHeadline(result), "Order scheduled");
  });

  it("asks for a delivery window when scheduling", () => {
    const lines = addToCart([], margherita, ember.id);
    const result = placeOrder({ lines, coupon: null, deliveryFee: ember.fee, address: "12 Market Street", eta: ember.eta, delivery: { type: "scheduled", day: "Tomorrow" } });
    assert.equal(resultHeadline(result), "Choose a delivery time");
  });
});
