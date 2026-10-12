import { DELIVERY_WINDOWS, type Delivery } from "../lib/checkout.ts";
import { Bike, Calendar } from "./icons.tsx";

/** How and when the order arrives: now, or a window tomorrow. */
export function DeliveryPicker({ delivery, setDelivery, eta }: { delivery: Delivery; setDelivery: (d: Delivery) => void; eta: string }) {
  const scheduled = delivery.type === "scheduled";
  return (
    <section className="dd-panel">
      <h2>
        <Bike size={16} /> Delivery
      </h2>
      <div className="dd-options" role="radiogroup" aria-label="Delivery time">
        <button type="button" role="radio" aria-checked={!scheduled} className={`dd-option ${!scheduled ? "is-on" : ""}`} onClick={() => setDelivery({ type: "now" })}>
          <b>Deliver now</b>
          <span className="dd-muted dd-small">{eta}</span>
        </button>
        <button type="button" role="radio" aria-checked={scheduled} className={`dd-option ${scheduled ? "is-on" : ""}`} onClick={() => setDelivery({ type: "scheduled", day: "Tomorrow" })}>
          <b>Schedule</b>
          <span className="dd-muted dd-small">Pick a time tomorrow</span>
        </button>
      </div>
      {scheduled ? (
        <div className="dd-slots" role="radiogroup" aria-label="Delivery window tomorrow">
          <span className="dd-slot-day">
            <Calendar size={14} /> Tomorrow
          </span>
          {DELIVERY_WINDOWS.map((w) => (
            <button key={w} type="button" role="radio" aria-checked={delivery.window === w} className={`dd-slot ${delivery.window === w ? "is-on" : ""}`} onClick={() => setDelivery({ type: "scheduled", day: "Tomorrow", window: w })}>
              {w}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function deliveryLabel(delivery: Delivery, eta: string): string {
  if (delivery.type === "scheduled") return delivery.window ? `${delivery.day ?? "Tomorrow"}, ${delivery.window}` : "Choose a window tomorrow";
  return `Arriving in ${eta}`;
}
