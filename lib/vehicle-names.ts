// Some cars share a family name but are separate models, not trims —
// a Range Rover Sport isn't a trim of the Range Rover. Brokers (and the AI)
// often write "Range Rover" + trim "Sport P360 SE"; this moves the model
// part back into the model so filters, featured picks and photos treat it
// as its own car. Used wherever a listing is saved or matched.
const SUB_MODELS: { make: string; family: string; models: string[] }[] = [
  { make: "Land Rover", family: "Range Rover", models: ["Sport", "Velar", "Evoque"] },
];

// One spelling per brand ("KIA", "kia" -> "Kia"), so filters don't list a
// brand twice. Unknown makes are kept as written.
const MAKES = [
  "Acura", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler",
  "Dodge", "Ferrari", "Fiat", "Fisker", "Ford", "Genesis", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep",
  "Kia", "Lamborghini", "Land Rover", "Lexus", "Lincoln", "Lotus", "Lucid", "Maserati", "Mazda", "McLaren",
  "Mercedes-Benz", "MINI", "Mitsubishi", "Nissan", "Polestar", "Porsche", "Ram", "Rivian", "Rolls-Royce", "Subaru",
  "Tesla", "Toyota", "VinFast", "Volkswagen", "Volvo",
];
const makeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const MAKE_BY_KEY = new Map<string, string>([
  ...MAKES.map((m) => [makeKey(m), m] as [string, string]),
  ["mercedes", "Mercedes-Benz"],
  ["benz", "Mercedes-Benz"],
  ["mb", "Mercedes-Benz"],
  ["vw", "Volkswagen"],
  ["chevy", "Chevrolet"],
]);

export function canonicalMake(make: string): string {
  const trimmed = make.trim().replace(/\s+/g, " ");
  return MAKE_BY_KEY.get(makeKey(trimmed)) ?? trimmed;
}

// Names brands write in capitals ("IONIQ 9", "LYRIQ", "Tucson PHEV") — kept
// that way, and fixed when written otherwise ("Ioniq 5" -> "IONIQ 5").
const CAPITALIZED = new Set(["IONIQ", "LYRIQ", "OPTIQ", "VISTIQ", "CELESTIQ", "PHEV", "AMG", "XM"]);

// One spelling per model, so the filters don't list a car twice:
// - a model typed in capitals ("PALISADE", "SANTA FE Hybrid") gets normal
//   case ("Palisade", "Santa Fe Hybrid"), except the names above;
// - Lexus and Mercedes model numbers get their space and suffix
//   ("NX350" -> "NX 350", "NX450H" -> "NX 450h+", "C300" -> "C 300");
// - "X5M" -> "X5 M".
export function canonicalModel(make: string, model: string): string {
  let m = model.trim().replace(/\s+/g, " ");
  if (!m) return m;

  const words = m.split(" ");
  const shouting = words.some((w) => /^[A-Z]{4,}$/.test(w) && !CAPITALIZED.has(w));
  m = words
    .map((w) => {
      if (CAPITALIZED.has(w.toUpperCase())) return w.toUpperCase();
      if (shouting && /^[A-Z]{2,}$/.test(w)) return w.charAt(0) + w.slice(1).toLowerCase();
      return w;
    })
    .join(" ");

  if (make === "Lexus") {
    const lex = m.match(/^(ES|IS|LS|LC|NX|RX|TX|GX|LX|UX|RZ|RC)\s*(\d{3})\s*([a-zA-Z])?\s*(\+)?(?=\s|$)(.*)$/i);
    if (lex) {
      const [, series, num, suffix = "", plus = "", rest] = lex;
      // The NX 450h+ only comes as the plug-in.
      const plug = plus || (series.toUpperCase() === "NX" && num === "450" && suffix.toLowerCase() === "h") ? "+" : "";
      m = `${series.toUpperCase()} ${num}${suffix.toLowerCase()}${plug}${rest}`;
    }
  } else if (make === "Mercedes-Benz") {
    m = m.replace(/^(A|C|E|S|G|CLA|CLE|CLS|GLA|GLB|GLC|GLE|GLS|EQB|EQE|EQS|SL)\s*(\d{2,3})(?=\b|\+)/i, (_, series: string, num: string) => `${series.toUpperCase()} ${num}`);
  } else if (make === "BMW") {
    m = m.replace(/^X([3-6])\s*M(?=\s|$)/i, "X$1 M");
  }
  return m;
}

// BMW trims written into the model ("X5 sDrive40i", "X3 30 xDrive", "i5
// eDrive40"): the drivetrain part is the trim, so the car files under "X5".
const BMW_TRIM_IN_MODEL = /^(\S+)\s+((?:\d{2}\s*)?[sxe]Drive\S*.*)$/i;

// BMW's numbered cars are a series with the engine as the trim: "740i" and
// "750e" are both the 7 Series, "M340i" the 3 Series, "M850i Gran Coupe" the
// 8 Series. (M3/M4, the X models and i4/i5/i7 are models of their own.)
const BMW_SERIES_MODEL = /^(M?([2-8])\d{2}[a-z]{0,2})\b\s*(.*)$/i;

// The trim with `lead` in front, unless the trim already starts with it.
function prefixTrim(lead: string, trim: string | null): string {
  const t = trim?.trim() ?? "";
  return t.toLowerCase().startsWith(lead.toLowerCase()) ? t : [lead, t].filter(Boolean).join(" ");
}

export function normalizeModelTrim<T extends { make: string; model: string; trim: string | null }>(input: T): T {
  const car = { ...input, make: canonicalMake(input.make) };
  car.model = canonicalModel(car.make, car.model);
  if (car.make === "BMW") {
    const series = car.model.match(BMW_SERIES_MODEL);
    if (series) {
      const [, engine, digit, rest] = series;
      car.model = `${digit} Series`;
      car.trim = prefixTrim([engine, rest.trim()].filter(Boolean).join(" "), car.trim);
    } else {
      const split = car.model.match(BMW_TRIM_IN_MODEL);
      if (split) {
        car.model = split[1];
        car.trim = prefixTrim(split[2].trim(), car.trim);
      }
    }
  }
  const make = car.make.trim();
  const model = car.model.trim().replace(/\s+/g, " ");
  const trim = car.trim?.trim().replace(/\s+/g, " ") || null;

  for (const { make: m, family, models } of SUB_MODELS) {
    // "Range Rover" sometimes comes in as the make.
    const isMake = make.toLowerCase() === m.toLowerCase() || make.toLowerCase() === family.toLowerCase();
    if (!isMake) continue;
    const fixedMake = m;

    // Model already names the sub-model ("Range Rover Sport"): just tidy the case.
    for (const sub of models) {
      if (model.toLowerCase() === `${family} ${sub}`.toLowerCase()) {
        return { ...car, make: fixedMake, model: `${family} ${sub}`, trim };
      }
    }

    // Model is just the family and the trim starts with the sub-model.
    if (model.toLowerCase() === family.toLowerCase() || (make.toLowerCase() === family.toLowerCase() && !model)) {
      for (const sub of models) {
        const match = trim?.match(new RegExp(`^${sub}\\b[\\s,/-]*`, "i"));
        if (match) {
          return { ...car, make: fixedMake, model: `${family} ${sub}`, trim: trim!.slice(match[0].length).trim() || null };
        }
      }
      return { ...car, make: fixedMake, model: family, trim };
    }

    // Make "Range Rover", model "Sport" / "Velar" / "Evoque".
    if (make.toLowerCase() === family.toLowerCase()) {
      const sub = models.find((s) => model.toLowerCase() === s.toLowerCase());
      if (sub) return { ...car, make: fixedMake, model: `${family} ${sub}`, trim };
    }
  }
  return car;
}

// Program names written next to the car ("740i LOYALTY PLUS", "X5 w/
// Conquest") are what the advertised price requires, not part of the trim.
const PROGRAM_IN_TRIM =
  /\b(loyalty\s*plus|loyalty|conquest|military|college\s*grad(?:uate)?|first\s*responder|[axz][-\s]?plan|myfirstev)\b/gi;

export function splitProgramsFromTrim(trim: string | null): { trim: string | null; programs: string[] } {
  if (!trim) return { trim, programs: [] };
  const programs = [...trim.matchAll(PROGRAM_IN_TRIM)].map((m) =>
    m[1].replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase())
  );
  if (programs.length === 0) return { trim, programs };
  const rest = trim
    .replace(PROGRAM_IN_TRIM, " ")
    .replace(/\b(w\/|with|and|req(?:uired)?)(?=\s|$)/gi, " ")
    .replace(/[&+,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-/]+|[\s\-/]+$/g, "")
    .trim();
  return { trim: rest || null, programs };
}

// For parsed listings: the programs come out of the trim and are listed as
// required (price-included, value unstated) unless already listed.
export function moveProgramsToIncentives<
  T extends { trim: string | null; incentives?: { name: string; amount: number; includedInPrice: boolean; monthly?: number }[] },
>(car: T): T {
  const { trim, programs } = splitProgramsFromTrim(car.trim);
  if (programs.length === 0) return car;
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const incentives = [...(car.incentives ?? [])];
  for (const p of programs) {
    if (!incentives.some((i) => key(i.name).endsWith(key(p)))) incentives.push({ name: p, amount: 0, includedInPrice: true });
  }
  return { ...car, trim, incentives };
}
