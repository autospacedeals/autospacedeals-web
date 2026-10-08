// Some cars share a family name but are separate models, not trims —
// a Range Rover Sport isn't a trim of the Range Rover. Brokers (and the AI)
// often write "Range Rover" + trim "Sport P360 SE"; this moves the model
// part back into the model so filters, featured picks and photos treat it
// as its own car. Used wherever a listing is saved or matched.
const SUB_MODELS: { make: string; family: string; models: string[] }[] = [
  { make: "Land Rover", family: "Range Rover", models: ["Sport", "Velar", "Evoque"] },
];

export function normalizeModelTrim<T extends { make: string; model: string; trim: string | null }>(car: T): T {
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
