export const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);

// Fixed locale + time zone so server and browser render identical text (no hydration mismatch)
const dtf = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
export const dateTime = (iso: string) => dtf.format(new Date(iso));
