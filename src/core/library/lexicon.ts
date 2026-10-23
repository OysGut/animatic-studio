// i18n-ignore-file – multilingual lexical data, not UI copy
export type EntityKind = "character" | "animal" | "object" | "location" | "environment" | "sound";
export function nounForms(word: string): string[] {
  const w = word.toLocaleLowerCase("und");
  const forms = [w, `${w}en`, `${w}et`, `${w}a`, `${w}er`, `${w}ene`, `${w}ane`, `${w}s`, `${w}es`];
  if (w.endsWith("e")) forms.push(`${w}n`, `${w}t`, `${w.slice(0, -1)}a`, `${w}r`, `${w}ne`);
  if (w.endsWith("y")) forms.push(`${w.slice(0, -1)}ies`);
  return [...new Set(forms)];
}
export const ENTITY_LEXICON: Readonly<Record<Exclude<EntityKind, "sound">, readonly string[]>> = {
  animal: "katt hund hest ku kyr okse kalv sau søye geit gris purke høne hane kylling and gås gjess kanin hare mus rotte hamster esel ponni føll lam rein elg hjort rådyr rev ulv bjørn ekorn bever oter gaupe grevling pinnsvin fugl ørn ugle kråke ravn spurv due måke svane falk fisk laks torsk ørret aure hai hval kval sel insekt bie veps maur flue mygg sommerfugl edderkopp bille orm slange frosk padde cat dog horse cow bull calf sheep goat pig hen rooster chicken duck goose geese rabbit mouse mice rat donkey pony foal lamb deer fox wolf wolves bear squirrel beaver otter lynx badger hedgehog bird eagle owl crow raven sparrow pigeon gull swan falcon fish salmon cod trout shark whale seal bee wasp ant fly mosquito butterfly spider snake frog".split(" "),
  character: "nisse troll hulder huldra draug spøkelse spøkjelse engel djevel heks alv fe goblin ghost angel devil witch elf fairy ogre monster".split(" "),
  location: "kjøkken kjøken låve løe stue stove rom soverom bad gang loft kjeller kjellar hus hytte gård gard tun skole skule kirke kyrkje butikk slott borg bro bru vei veg gate kitchen barn livingroom bedroom bathroom hallway attic cellar house cabin farm school church shop castle bridge road street".split(" "),
  environment: "skog fjell eng strand hav sjø innsjø elv dal mark myr ørken himmel forest mountain meadow beach sea ocean lake river valley field marsh desert sky".split(" "),
  object: "sekk lykt lampe bord stol dør vindu vindauge kniv sverd øks øks hammer tau nøkkel nøkkel bok kopp krukke vase flaske kiste slede seng teppe tallerken gryte bøtte spann klokke ball dukke dokke vogn bil båt sykkel paraply bag sack lantern lamp table chair door window knife sword axe rope key book cup jar vase bottle chest sled bed blanket plate pot bucket clock ball doll cart car boat bicycle umbrella".split(" "),
};
export const LEXICON_FORMS: ReadonlyMap<string, { kind: EntityKind; base: string }> = new Map(
  Object.entries(ENTITY_LEXICON).flatMap(([kind, words]) => words.flatMap((base) => nounForms(base).map((form) => [form, { kind: kind as EntityKind, base }] as const))),
);
export const ANIMAL_VERBS = "logrer mjauer maler bjeffer gneldrer galer vrinsker breker rauter grynter kvitrer kakler meows barks wags neighs chirps purrs crows moos bleats".split(" ");
export const LIVING_VERBS = "sier seier roper ropar svarer svarar hvisker kviskrar ler gråter gret says shouts replies whispers laughs cries".split(" ");