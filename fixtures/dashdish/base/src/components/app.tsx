"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, RESTAURANTS, formatPrice, restaurantById, type Dish, type Restaurant } from "../lib/menu.ts";
import { ADD_ONS, COUPONS, SIZES, addToCart, cartTotals, itemCount, normalizeCoupon, setQuantity, unitPrice, type CartLine, type Choice } from "../lib/cart.ts";
import { placeOrder, resultHeadline, type Delivery, type OrderResult } from "../lib/checkout.ts";
import { DishArt } from "./dish-art.tsx";
import { DeliveryPicker, deliveryLabel } from "./delivery.tsx";
import { Alert, Back, Bag, Bike, Check, Clock, Flame, Heart, Home, Minus, Pin, Plus, Search, Star, Tag } from "./icons.tsx";

type Screen = { name: "home" } | { name: "restaurant"; id: string } | { name: "dish"; rid: string; did: string } | { name: "cart" } | { name: "done" };

function parseHash(): Screen {
  if (typeof window === "undefined") return { name: "home" };
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("r/")) return { name: "restaurant", id: h.slice(2) };
  if (h.startsWith("d/")) {
    const [rid, did] = h.slice(2).split("/");
    return { name: "dish", rid, did };
  }
  if (h === "cart") return { name: "cart" };
  if (h === "done") return { name: "done" };
  return { name: "home" };
}

function hashFor(s: Screen): string {
  return s.name === "restaurant" ? `#/r/${s.id}` : s.name === "dish" ? `#/d/${s.rid}/${s.did}` : s.name === "home" ? "#/" : `#/${s.name}`;
}

/** DashDish: a single-page food ordering demo. All state is in memory. */
export function DashDish() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery>({ type: "now" });
  const [result, setResult] = useState<OrderResult | null>(null);
  const [address, setAddress] = useState("12 Market Street, Apt 4");

  useEffect(() => {
    const sync = () => setScreen(parseHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const go = (s: Screen) => {
    setScreen(s);
    try {
      window.history.pushState(null, "", hashFor(s));
    } catch {
      /* sandboxed frames may refuse history changes */
    }
    window.scrollTo(0, 0);
  };

  const restaurant = cart[0] ? restaurantById(cart[0].restaurantId) ?? null : null;

  function order() {
    const r = placeOrder({ lines: cart, coupon, deliveryFee: restaurant?.fee ?? 0, address, eta: restaurant?.eta ?? "25–35 min", delivery });
    setResult(r);
    if (r.status === "confirmed") go({ name: "done" });
  }

  return (
    <div className="dd-app">
      <div className="dd-screen" key={screen.name === "restaurant" ? `r-${screen.id}` : screen.name === "dish" ? `d-${screen.did}` : screen.name}>
        {screen.name === "home" ? <HomeScreen open={(id) => go({ name: "restaurant", id })} /> : null}
        {screen.name === "restaurant" ? (
          <RestaurantScreen
            restaurant={restaurantById(screen.id) ?? RESTAURANTS[0]}
            cart={cart}
            onAdd={(dish, r) => setCart((c) => addToCart(c.filter((l) => l.restaurantId === r.id), dish, r.id))}
            onQty={(id, q) => setCart((c) => setQuantity(c, id, q))}
            open={(d, r) => go({ name: "dish", rid: r.id, did: d.id })}
            back={() => go({ name: "home" })}
            toCart={() => go({ name: "cart" })}
          />
        ) : null}
        {screen.name === "dish" ? (
          <DishScreen
            restaurant={restaurantById(screen.rid) ?? RESTAURANTS[0]}
            dishId={screen.did}
            back={() => go({ name: "restaurant", id: screen.rid })}
            add={(dish, r, qty, choice) => {
              setCart((c) => addToCart(c.filter((l) => l.restaurantId === r.id), dish, r.id, qty, choice));
              go({ name: "restaurant", id: r.id });
            }}
          />
        ) : null}
        {screen.name === "cart" ? (
          <CartScreen
            cart={cart}
            restaurant={restaurant}
            coupon={coupon}
            setCoupon={setCoupon}
            delivery={delivery}
            setDelivery={setDelivery}
            address={address}
            setAddress={setAddress}
            onQty={(id, q) => setCart((c) => setQuantity(c, id, q))}
            result={result}
            back={() => go(restaurant ? { name: "restaurant", id: restaurant.id } : { name: "home" })}
            place={order}
          />
        ) : null}
        {screen.name === "done" ? (
          <DoneScreen
            result={result}
            cart={cart}
            home={() => {
              setCart([]);
              setCoupon(null);
              setResult(null);
              setDelivery({ type: "now" });
              go({ name: "home" });
            }}
          />
        ) : null}
      </div>
      {screen.name === "home" ? (
        <nav className="dd-tabbar" aria-label="DashDish">
          <span className="dd-tab dd-tab-active">
            <Home size={20} /> Home
          </span>
          <button type="button" className="dd-tab" onClick={() => go({ name: "cart" })}>
            <Bag size={20} /> Cart{itemCount(cart) ? <b className="dd-badge">{itemCount(cart)}</b> : null}
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function HomeScreen({ open }: { open: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const list = useMemo(
    () =>
      RESTAURANTS.filter((r) => {
        const text = `${r.name} ${r.cuisine} ${r.dishes.map((d) => d.name).join(" ")}`.toLowerCase();
        return (!q || text.includes(q.toLowerCase())) && (!cat || r.art === cat || r.dishes.some((d) => d.art === cat));
      }),
    [q, cat],
  );
  return (
    <main className="dd-home">
      <header className="dd-top">
        <div>
          <p className="dd-muted dd-small">Deliver to</p>
          <p className="dd-address">
            <Pin size={16} /> 12 Market Street
          </p>
        </div>
        <span className="dd-avatar" aria-hidden>
          M
        </span>
      </header>
      <h1 className="dd-hero-title">
        What are you <em>craving</em>, Maya?
      </h1>
      <label className="dd-search">
        <Search size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes or restaurants" aria-label="Search dishes or restaurants" />
      </label>
      <div className="dd-cats" role="list">
        {CATEGORIES.map((c) => (
          <button key={c.label} type="button" role="listitem" className={`dd-cat ${cat === c.art ? "is-on" : ""}`} onClick={() => setCat(cat === c.art ? null : c.art)} aria-pressed={cat === c.art}>
            <span className="dd-cat-art">
              <DishArt art={c.art} />
            </span>
            {c.label}
          </button>
        ))}
      </div>
      <div className="dd-section-head">
        <h2>Popular near you</h2>
        <span className="dd-muted dd-small">{list.length} places</span>
      </div>
      <ul className="dd-cards">
        {list.map((r) => (
          <li key={r.id}>
            <button type="button" className="dd-card" onClick={() => open(r.id)} aria-label={`Open ${r.name}`}>
              <span className="dd-card-art" style={{ background: `radial-gradient(120% 90% at 70% 30%, ${r.tint}, #15161b 70%)` }}>
                <DishArt art={r.art} className="dd-card-dish" />
                <span className="dd-pill dd-pill-dark">
                  <Clock size={13} /> {r.eta}
                </span>
              </span>
              <span className="dd-card-body">
                <span className="dd-card-name">{r.name}</span>
                <span className="dd-muted dd-small">{r.cuisine}</span>
                <span className="dd-meta">
                  <span className="dd-rating">
                    <Star size={13} /> {r.rating.toFixed(1)}
                  </span>
                  <span className="dd-muted">({r.reviews})</span>
                  <span className="dd-dot" />
                  <Bike size={14} /> {formatPrice(r.fee)}
                </span>
              </span>
            </button>
          </li>
        ))}
        {!list.length ? <li className="dd-muted dd-empty">Nothing matches “{q}”.</li> : null}
      </ul>
    </main>
  );
}

function RestaurantScreen({
  restaurant: r,
  cart,
  onAdd,
  onQty,
  open,
  back,
  toCart,
}: {
  restaurant: Restaurant;
  cart: CartLine[];
  onAdd: (d: Dish, r: Restaurant) => void;
  onQty: (id: string, q: number) => void;
  open: (d: Dish, r: Restaurant) => void;
  back: () => void;
  toCart: () => void;
}) {
  const lines = cart.filter((l) => l.restaurantId === r.id);
  const totals = cartTotals(lines, r.fee, null);
  return (
    <main className="dd-rest">
      <div className="dd-rest-hero" style={{ background: `radial-gradient(110% 80% at 50% 25%, ${r.tint}, #121317 72%)` }}>
        <button type="button" className="dd-round" onClick={back} aria-label="Back">
          <Back size={20} />
        </button>
        <DishArt art={r.art} className="dd-rest-dish" label={r.cuisine} />
      </div>
      <section className="dd-rest-info">
        <h1>{r.name}</h1>
        <p className="dd-muted">{r.cuisine}</p>
        <p className="dd-chips">
          <span className="dd-chip">
            <Star size={14} /> {r.rating.toFixed(1)} <span className="dd-muted">({r.reviews})</span>
          </span>
          <span className="dd-chip">
            <Clock size={14} /> {r.eta}
          </span>
          <span className="dd-chip">
            <Bike size={14} /> {formatPrice(r.fee)}
          </span>
        </p>
      </section>
      <h2 className="dd-menu-title">Menu</h2>
      <ul className="dd-menu">
        {r.dishes.map((d) => {
          const line = lines.find((l) => l.key === d.id);
          return (
            <li key={d.id} className="dd-dish">
              <button type="button" className="dd-dish-open" onClick={() => open(d, r)} aria-label={`Customize ${d.name}`}>
              <span className="dd-dish-art">
                <DishArt art={d.art} />
              </span>
              <span className="dd-dish-body">
                {d.popular ? <span className="dd-popular">Popular</span> : null}
                <span className="dd-dish-name">{d.name}</span>
                <span className="dd-muted dd-small dd-desc">{d.description}</span>
                <span className="dd-dish-foot">
                  <b>{formatPrice(d.price)}</b>
                  <span className="dd-muted dd-small">{d.kcal} kcal</span>
                </span>
              </span>
              </button>
              {line ? (
                <span className="dd-stepper" aria-label={`${d.name} quantity`}>
                  <button type="button" onClick={() => onQty(d.id, line.quantity - 1)} aria-label={`Remove one ${d.name}`}>
                    <Minus size={16} />
                  </button>
                  <b>{line.quantity}</b>
                  <button type="button" onClick={() => onAdd(d, r)} aria-label={`Add another ${d.name}`}>
                    <Plus size={16} />
                  </button>
                </span>
              ) : (
                <button type="button" className="dd-add" onClick={() => onAdd(d, r)} aria-label={`Add ${d.name}`}>
                  <Plus size={18} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {lines.length ? (
        <div className="dd-floating">
          <button type="button" className="dd-cta" onClick={toCart}>
            <span className="dd-cta-count">{itemCount(lines)}</span>
            View cart
            <span className="dd-cta-price">{formatPrice(totals.subtotal)}</span>
          </button>
        </div>
      ) : null}
    </main>
  );
}

function DishScreen({ restaurant: r, dishId, back, add }: { restaurant: Restaurant; dishId: string; back: () => void; add: (d: Dish, r: Restaurant, qty: number, c: Choice) => void }) {
  const d = r.dishes.find((x) => x.id === dishId) ?? r.dishes[0];
  const [choice, setChoice] = useState<Choice>({ size: "medium", addOns: [] });
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);
  const total = unitPrice(d, choice) * qty;
  const toggle = (id: string) => setChoice((c) => ({ ...c, addOns: c.addOns.includes(id) ? c.addOns.filter((x) => x !== id) : [...c.addOns, id] }));
  return (
    <main className="dd-detail">
      <div className="dd-detail-hero" style={{ background: `radial-gradient(90% 70% at 50% 42%, ${r.tint}, #121317 74%)` }}>
        <button type="button" className="dd-round" onClick={back} aria-label="Back">
          <Back size={20} />
        </button>
        <button type="button" className={`dd-round dd-like ${liked ? "is-on" : ""}`} onClick={() => setLiked(!liked)} aria-pressed={liked} aria-label="Save dish">
          <Heart size={18} />
        </button>
        <DishArt art={d.art} className="dd-detail-dish" label={d.name} />
      </div>
      <section className="dd-detail-body">
        <div className="dd-detail-head">
          <h1>{d.name}</h1>
          <b className="dd-detail-price">{formatPrice(unitPrice(d, choice))}</b>
        </div>
        <p className="dd-muted dd-detail-desc">{d.description}</p>
        <p className="dd-detail-meta">
          <span>
            <Star size={15} /> {r.rating.toFixed(1)} <span className="dd-muted">({r.reviews})</span>
          </span>
          <span>
            <Clock size={15} /> {r.eta}
          </span>
          <span>
            <Flame size={15} /> {d.kcal} kcal
          </span>
        </p>
        <h2 className="dd-detail-h">Size options</h2>
        <div className="dd-sizes" role="radiogroup" aria-label="Size">
          {SIZES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={choice.size === s.id} className={`dd-size ${choice.size === s.id ? "is-on" : ""}`} onClick={() => setChoice((c) => ({ ...c, size: s.id }))}>
              {s.label}
            </button>
          ))}
        </div>
        <h2 className="dd-detail-h">Add-ons</h2>
        <ul className="dd-addons">
          {ADD_ONS.map((a) => {
            const on = choice.addOns.includes(a.id);
            return (
              <li key={a.id}>
                <button type="button" role="checkbox" aria-checked={on} className={`dd-addon ${on ? "is-on" : ""}`} onClick={() => toggle(a.id)}>
                  <span className="dd-addon-art" aria-hidden>
                    <DishArt art={a.id === "cheese" ? "pasta" : a.id === "chili" ? "ramen" : "dumplings"} />
                  </span>
                  <span className="dd-addon-name">{a.label}</span>
                  <span className="dd-muted dd-small">+{formatPrice(a.price)}</span>
                  <span className="dd-addon-box" aria-hidden>{on ? <Check size={14} /> : <Plus size={14} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="dd-detail-qty">
          <span className="dd-muted">Quantity</span>
          <span className="dd-stepper" aria-label="Quantity">
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Fewer">
              <Minus size={16} />
            </button>
            <b>{qty}</b>
            <button type="button" onClick={() => setQty(qty + 1)} aria-label="More">
              <Plus size={16} />
            </button>
          </span>
        </div>
      </section>
      <div className="dd-detail-bar">
        <span>
          <span className="dd-muted dd-small">Total amount</span>
          <b className="dd-detail-total">{formatPrice(total)}</b>
        </span>
        <button type="button" className="dd-cta dd-detail-add" onClick={() => add(d, r, qty, choice)}>
          <Bag size={18} /> Add to cart
        </button>
      </div>
    </main>
  );
}

function CartScreen(props: {
  cart: CartLine[];
  restaurant: Restaurant | null;
  coupon: string | null;
  setCoupon: (c: string | null) => void;
  delivery: Delivery;
  setDelivery: (d: Delivery) => void;
  address: string;
  setAddress: (a: string) => void;
  onQty: (id: string, q: number) => void;
  result: OrderResult | null;
  back: () => void;
  place: () => void;
}) {
  const { cart, restaurant, coupon, setCoupon } = props;
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const totals = cartTotals(cart, restaurant?.fee ?? 0, coupon);
  const rejected = props.result?.status === "rejected" ? props.result : null;

  if (!cart.length) {
    return (
      <main className="dd-cart">
        <header className="dd-bar">
          <button type="button" className="dd-round" onClick={props.back} aria-label="Back">
            <Back size={20} />
          </button>
          <h1>Your cart</h1>
        </header>
        <p className="dd-muted dd-empty">Your cart is empty. Pick something delicious.</p>
      </main>
    );
  }

  return (
    <main className="dd-cart">
      <header className="dd-bar">
        <button type="button" className="dd-round" onClick={props.back} aria-label="Back">
          <Back size={20} />
        </button>
        <div>
          <h1>Your order</h1>
          <p className="dd-muted dd-small">{restaurant?.name}</p>
        </div>
      </header>

      <ul className="dd-lines">
        {cart.map((l) => (
          <li key={l.key}>
            <span className="dd-line-art">
              <DishArt art={restaurant?.dishes.find((d) => d.id === l.dishId)?.art ?? "pizza"} />
            </span>
            <span className="dd-line-body">
              <span className="dd-dish-name">{l.name}</span>
              <span className="dd-muted dd-small">{l.options ? `${l.options} · ` : ""}{formatPrice(l.price)} each</span>
            </span>
            <span className="dd-stepper dd-stepper-sm">
              <button type="button" onClick={() => props.onQty(l.key, l.quantity - 1)} aria-label={`Remove one ${l.name}`}>
                <Minus size={14} />
              </button>
              <b>{l.quantity}</b>
              <button type="button" onClick={() => props.onQty(l.key, l.quantity + 1)} aria-label={`Add another ${l.name}`}>
                <Plus size={14} />
              </button>
            </span>
          </li>
        ))}
      </ul>

      <section className="dd-panel">
        <h2>
          <Tag size={16} /> Promo code
        </h2>
        {coupon ? (
          <p className="dd-applied">
            <span>
              <Check size={16} /> <b>{coupon}</b> · {COUPONS[coupon].label}
            </span>
            <button type="button" className="dd-link" onClick={() => setCoupon(null)}>
              Remove
            </button>
          </p>
        ) : (
          <form
            className="dd-coupon"
            onSubmit={(e) => {
              e.preventDefault();
              const c = normalizeCoupon(code);
              setCodeError(c ? null : "That code isn't valid");
              if (c) setCoupon(c);
            }}
          >
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Try WELCOME10" aria-label="Promo code" />
            <button type="submit">Apply</button>
          </form>
        )}
        {codeError ? <p className="dd-error-text">{codeError}</p> : null}
      </section>

      <DeliveryPicker delivery={props.delivery} setDelivery={props.setDelivery} eta={restaurant?.eta ?? "25–35 min"} />

      <section className="dd-panel">
        <h2>
          <Pin size={16} /> Deliver to
        </h2>
        <input className="dd-field" value={props.address} onChange={(e) => props.setAddress(e.target.value)} aria-label="Delivery address" />
      </section>

      <dl className="dd-summary">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatPrice(totals.subtotal)}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>{totals.delivery ? formatPrice(totals.delivery) : "Free"}</dd>
        </div>
        {totals.discount ? (
          <div className="dd-discount">
            <dt>Discount</dt>
            <dd>−{formatPrice(totals.discount)}</dd>
          </div>
        ) : null}
        <div className="dd-total">
          <dt>Total</dt>
          <dd>{formatPrice(totals.total)}</dd>
        </div>
      </dl>

      {rejected ? (
        <p className="dd-alert" role="alert">
          <Alert size={18} /> {resultHeadline(rejected)}
        </p>
      ) : null}

      <div className="dd-floating dd-floating-static">
        <button type="button" className="dd-cta dd-cta-place" onClick={props.place}>
          Place order <span className="dd-cta-price">{formatPrice(totals.total)}</span>
        </button>
        <p className="dd-muted dd-small dd-center">{deliveryLabel(props.delivery, restaurant?.eta ?? "25–35 min")}</p>
      </div>
    </main>
  );
}

function DoneScreen({ result, cart, home }: { result: OrderResult | null; cart: CartLine[]; home: () => void }) {
  if (!result || result.status !== "confirmed") {
    return (
      <main className="dd-done">
        <p className="dd-muted">No order yet.</p>
        <button type="button" className="dd-cta" onClick={home}>
          Back to home
        </button>
      </main>
    );
  }
  return (
    <main className="dd-done">
      <div className="dd-check" aria-hidden>
        <Check size={44} />
      </div>
      <h1>{resultHeadline(result)}</h1>
      <p className="dd-order-id">Order {result.id}</p>
      <div className="dd-eta">
        <Clock size={18} />
        <span>{deliveryLabel(result.delivery, result.eta)}</span>
      </div>
      <ul className="dd-receipt">
        {cart.map((l) => (
          <li key={l.key}>
            <span>
              {l.quantity} × {l.name}
              {l.options ? <small className="dd-muted"> · {l.options}</small> : null}
            </span>
            <span>{formatPrice(l.price * l.quantity)}</span>
          </li>
        ))}
        <li className="dd-total">
          <span>Paid</span>
          <span>{formatPrice(result.total)}</span>
        </li>
      </ul>
      <button type="button" className="dd-cta dd-cta-ghost" onClick={home}>
        Back to home
      </button>
    </main>
  );
}
