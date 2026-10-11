#!/usr/bin/env python3
"""
Builds buywisely.db from schema.sql and everything in /data.

This is the ONE path for getting data into the site — whether that's
this repo's demo CSVs, or a real 500+ row export from a spreadsheet /
supplier feed. Replace the CSVs in /data with real data (same column
headers) and re-run this script to reload the database.

Usage:
    python3 import_data.py
"""
import csv, json, os, re, sqlite3, sys

HERE = os.path.dirname(__file__)
DB_PATH = os.environ.get('DB_PATH') or os.path.join(HERE, 'buywisely.db')
SCHEMA_PATH = os.path.join(HERE, 'schema.sql')
DATA_DIR = os.path.join(HERE, 'data')

# Maps each category's flat CSV columns onto the normalized
# quick_specs / full_specs JSON shape the frontend expects.
# This is the single place that encodes "what a phone's spec sheet
# looks like" vs "what a car's spec sheet looks like" — matches the
# SPEC SCHEMA comment that was already in the original index.html.
def build_specs_phones(r):
    quick = {'Display': r['display'], 'Processor': r['processor'], 'RAM': r['ram'],
             'Storage': r['storage'], 'Battery': r['battery'], 'Weight': r['weight']}
    full = {
        'Overview': {'Display': r['display'], 'Weight': r['weight'], 'Colors': r['colors']},
        'Performance': {'Processor': r['processor'], 'RAM': r['ram'], 'Storage': r['storage'],
                         'Operating system': r['operating_system']},
        'Camera': {'Cameras': r['cameras']},
        'Battery': {'Battery': r['battery'], 'Charging': r['charging']},
        'Connectivity': {'Connectivity': r['connectivity']},
    }
    return quick, full

def build_specs_laptops(r):
    quick = {'Display': r['display'], 'Processor': r['processor'], 'RAM': r['ram'],
             'Storage': r['storage'], 'Battery': r['battery'], 'Weight': r['weight']}
    perf = {'Processor': r['processor'], 'RAM': r['ram'], 'Storage': r['storage'],
            'Operating system': r['operating_system']}
    if r.get('gpu') and r['gpu'] != 'Integrated':
        perf['GPU'] = r['gpu']
    full = {
        'Overview': {'Display': r['display'], 'Weight': r['weight'], 'Build material': r['build_material']},
        'Performance': perf,
        'Battery': {'Battery': r['battery']},
        'Ports': {'Ports': r['ports']},
    }
    return quick, full

def build_specs_bikes(r):
    quick = {'Engine': r['engine'].split(',')[0], 'Horsepower': r['horsepower'],
             'Transmission': r['transmission'], 'Fuel economy': r['fuel_economy'],
             'Weight': r['weight'], 'Seat height': r['seat_height']}
    full = {
        'Overview': {'Engine': r['engine'], 'Transmission': r['transmission'], 'Fuel capacity': r['fuel_capacity']},
        'Performance': {'Horsepower': r['horsepower'], 'Torque': r['torque'],
                         'Top speed': r['top_speed'], 'Fuel economy': r['fuel_economy']},
        'Chassis': {'Brakes': r['brakes'], 'Tire size': r['tire_size'],
                    'Seat height': r['seat_height'], 'Ground clearance': r['ground_clearance']},
        'Details': {'Weight': r['weight'], 'Colors': r['colors']},
    }
    return quick, full

def build_specs_cars(r):
    quick = {'Engine': r['engine'], 'Horsepower': r['horsepower'], 'Transmission': r['transmission'],
             'Fuel economy': r['fuel_economy'], 'Seats': r['seats'], 'Airbags': r['airbags']}
    full = {
        'Overview': {'Engine': r['engine'], 'Transmission': r['transmission'], 'Drivetrain': r['drivetrain']},
        'Performance': {'Horsepower': r['horsepower'], 'Torque': r['torque'], 'Fuel economy': r['fuel_economy']},
        'Safety': {'Airbags': r['airbags'], 'ADAS': r['adas']},
        'Comfort': {'Seating': f"{r['seats']} seats", 'Infotainment': r['infotainment']},
    }
    return quick, full

SPEC_BUILDERS = {'phones': build_specs_phones, 'laptops': build_specs_laptops,
                  'bikes': build_specs_bikes, 'cars': build_specs_cars}

def brand_slug(name):
    s = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return s

def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(open(SCHEMA_PATH).read())

    # categories
    with open(os.path.join(DATA_DIR, 'categories.csv'), newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            conn.execute('INSERT INTO categories (id,label,icon,sort_order) VALUES (?,?,?,?)',
                         (row['id'], row['label'], row['icon'], int(row['sort_order'])))

    # terms
    with open(os.path.join(DATA_DIR, 'terms.csv'), newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            conn.execute('INSERT INTO terms (term,category,definition) VALUES (?,?,?)',
                         (row['term'], row['category'], row['definition']))

    seen_brands = set()
    product_count = 0
    for cat, builder in SPEC_BUILDERS.items():
        path = os.path.join(DATA_DIR, f'products_{cat}.csv')
        if not os.path.exists(path):
            print(f'  (skipping {cat}: no products_{cat}.csv found)')
            continue
        with open(path, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                bid = brand_slug(row['brand'])
                if bid not in seen_brands:
                    conn.execute('INSERT OR IGNORE INTO brands (id,name) VALUES (?,?)', (bid, row['brand']))
                    seen_brands.add(bid)
                quick, full = builder(row)
                price = int(row['price'])
                conn.execute('''INSERT INTO products
                    (id,category_id,brand_id,name,price,currency,color_swatch,image_url,
                     quick_specs,full_specs,source_name,source_url,affiliate_url)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                    (row['id'], cat, bid, row['name'], price, row.get('currency') or 'PKR',
                     row.get('color_swatch') or '', row.get('image_url') or '',
                     json.dumps(quick, ensure_ascii=False), json.dumps(full, ensure_ascii=False),
                     row.get('source_name') or '', row.get('source_url') or '',
                     row.get('affiliate_url') or ''))
                conn.execute('INSERT INTO price_history (product_id, price) VALUES (?,?)',
                             (row['id'], price))
                product_count += 1

    conn.commit()
    print(f'Imported: {len(seen_brands)} brands, {product_count} products -> {DB_PATH}')
    conn.close()

if __name__ == '__main__':
    main()
