import type { League } from "./rules";

export interface TeamOption {
  id: string;
  name: string;
  abbr: string;
  color: string;
  league: League;
}

/** Pro league — real cities, original mascots, authentic colour schemes. */
export const PRO_TEAMS: Omit<TeamOption, "league">[] = [
  { id: "azn", name: "Arizona Scorpions", abbr: "ARI", color: "#97233A" },
  { id: "atl", name: "Atlanta Firebirds", abbr: "ATL", color: "#A71930" },
  { id: "bal", name: "Baltimore Blackbirds", abbr: "BAL", color: "#241773" },
  { id: "buf", name: "Buffalo Bison", abbr: "BUF", color: "#00338D" },
  { id: "car", name: "Carolina Cats", abbr: "CAR", color: "#0085CA" },
  { id: "chi", name: "Chicago Monsters", abbr: "CHI", color: "#0B162A" },
  { id: "cin", name: "Cincinnati Stripes", abbr: "CIN", color: "#FB4F14" },
  { id: "cle", name: "Cleveland Dawgs", abbr: "CLE", color: "#311D00" },
  { id: "dal", name: "Dallas Lonestars", abbr: "DAL", color: "#041E42" },
  { id: "den", name: "Denver Mustangs", abbr: "DEN", color: "#FB4F14" },
  { id: "det", name: "Detroit Motors", abbr: "DET", color: "#0076B6" },
  { id: "gb", name: "Green Bay Voyageurs", abbr: "GB", color: "#203731" },
  { id: "hou", name: "Houston Comets", abbr: "HOU", color: "#03202F" },
  { id: "ind", name: "Indianapolis Racers", abbr: "IND", color: "#002C5F" },
  { id: "jax", name: "Jacksonville Jags", abbr: "JAX", color: "#006778" },
  { id: "kc", name: "Kansas City Monarchs", abbr: "KC", color: "#E31837" },
  { id: "lv", name: "Las Vegas Aces", abbr: "LV", color: "#0b0b0b" },
  { id: "lar", name: "Los Angeles Stars", abbr: "LA", color: "#003594" },
  { id: "lac", name: "Los Angeles Bolts", abbr: "LAC", color: "#0080C6" },
  { id: "mia", name: "Miami Sharks", abbr: "MIA", color: "#008E97" },
  { id: "min", name: "Minnesota Norse", abbr: "MIN", color: "#4F2683" },
  { id: "ne", name: "New England Minutemen", abbr: "NE", color: "#002244" },
  { id: "no", name: "New Orleans Jazz", abbr: "NO", color: "#101820" },
  { id: "nyg", name: "New York Empire", abbr: "NYG", color: "#0B2265" },
  { id: "nyj", name: "New York Blitz", abbr: "NYJ", color: "#125740" },
  { id: "phi", name: "Philadelphia Liberty", abbr: "PHI", color: "#004C54" },
  { id: "pit", name: "Pittsburgh Iron", abbr: "PIT", color: "#101820" },
  { id: "sf", name: "San Francisco Miners", abbr: "SF", color: "#AA0000" },
  { id: "sea", name: "Seattle Emeralds", abbr: "SEA", color: "#69BE28" },
  { id: "tb", name: "Tampa Bay Pirates", abbr: "TB", color: "#D50A0A" },
  { id: "ten", name: "Tennessee Comets", abbr: "TEN", color: "#0C2340" },
  { id: "was", name: "Washington Sentinels", abbr: "WAS", color: "#5A1414" },
];

/** College league — real regions, original mascots, authentic colours. */
export const COLLEGE_TEAMS: Omit<TeamOption, "league">[] = [
  { id: "ala", name: "Alabama Ironmen", abbr: "ALA", color: "#9E1B32" },
  { id: "aub", name: "Auburn Plainsmen", abbr: "AUB", color: "#DD550C" },
  { id: "cle_c", name: "Clemson Paws", abbr: "CLM", color: "#F56600" },
  { id: "fla", name: "Florida Reptiles", abbr: "FLA", color: "#0021A5" },
  { id: "fsu", name: "Tallahassee Warriors", abbr: "TLH", color: "#782F40" },
  { id: "uga", name: "Georgia Bulldawgs", abbr: "UGA", color: "#BA0C2F" },
  { id: "iowa", name: "Iowa Hawks", abbr: "IOW", color: "#000000" },
  { id: "lsu", name: "Bayou Tigers", abbr: "LSU", color: "#461D7C" },
  { id: "mia_c", name: "Miami Storm", abbr: "MIA", color: "#005030" },
  { id: "mich", name: "Michigan Wolves", abbr: "MICH", color: "#00274C" },
  { id: "msu", name: "East Lansing Green", abbr: "MSU", color: "#18453B" },
  { id: "neb", name: "Nebraska Huskers", abbr: "NEB", color: "#E41C38" },
  { id: "nd", name: "South Bend Irish", abbr: "ND", color: "#0C2340" },
  { id: "ohio", name: "Ohio Bucksmen", abbr: "OSU", color: "#BB0000" },
  { id: "okla", name: "Oklahoma Boomers", abbr: "OKL", color: "#841617" },
  { id: "ore", name: "Oregon Mallards", abbr: "ORE", color: "#154733" },
  { id: "psu", name: "Penn State Lions", abbr: "PSU", color: "#041E42" },
  { id: "usc", name: "Southern Cal Spartans", abbr: "USC", color: "#990000" },
  { id: "tam", name: "College Station Aggies", abbr: "TAM", color: "#500000" },
  { id: "tex", name: "Texas Steers", abbr: "TEX", color: "#BF5700" },
  { id: "tenn_c", name: "Tennessee Vols", abbr: "TEN", color: "#FF8200" },
  { id: "utah", name: "Utah Reds", abbr: "UTA", color: "#CC0000" },
  { id: "wash", name: "Seattle Sled Dogs", abbr: "WSH", color: "#4B2E83" },
  { id: "wisc", name: "Wisconsin Diggers", abbr: "WIS", color: "#C5050C" },
];

export function teamsForLeague(league: League): Omit<TeamOption, "league">[] {
  return league === "college" ? COLLEGE_TEAMS : PRO_TEAMS;
}
