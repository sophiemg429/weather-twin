#!/usr/bin/env python3
"""
Downloads GeoNames' cities15000 dataset (all cities with population > 15,000;
public domain / CC BY 4.0, https://www.geonames.org) and filters it down to
population > 100,000, writing cities.json for weather-twin.

Run locally (needs real internet access): python3 scripts/build_cities.py
"""
import csv, io, json, urllib.request, zipfile

GEONAMES_URL = "https://download.geonames.org/export/dump/cities15000.zip"
MIN_POPULATION = 100_000
OUTPUT_PATH = "cities.json"
COLUMNS = ["geonameid","name","asciiname","alternatenames","latitude","longitude",
    "feature_class","feature_code","country_code","cc2","admin1_code","admin2_code",
    "admin3_code","admin4_code","population","elevation","dem","timezone","modification_date"]

def main():
    print(f"Downloading {GEONAMES_URL} ...")
    with urllib.request.urlopen(GEONAMES_URL) as resp:
        data = resp.read()
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        txt_name = [n for n in zf.namelist() if n.endswith(".txt")][0]
        raw = zf.read(txt_name).decode("utf-8")
    reader = csv.DictReader(io.StringIO(raw), delimiter="\t", fieldnames=COLUMNS)
    cities, seen = [], set()
    for row in reader:
        try:
            population = int(row["population"])
        except (TypeError, ValueError):
            continue
        if population <= MIN_POPULATION:
            continue
        name = row["name"].strip()
        country = row["country_code"].strip()
        key = (name.lower(), country)
        if key in seen:
            continue
        seen.add(key)
        cities.append({"name": name, "country": country,
            "lat": float(row["latitude"]), "lon": float(row["longitude"]),
            "population": population})
    cities.sort(key=lambda c: -c["population"])
    with open(OUTPUT_PATH, "w") as f:
        json.dump(cities, f, indent=2)
    print(f"Wrote {len(cities)} cities to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
