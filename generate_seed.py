#!/usr/bin/env python3
"""
Generates the per-category CSV files under /data that the importer
(import_data.py) loads into SQLite.

IMPORTANT: the values below are programmatically varied for demo/
volume purposes — they are NOT verified real-world specs or prices.
Treat this exactly like the original 8 hand-written mock products:
illustrative data to prove the pipeline works end-to-end. Real specs
should replace these rows (same column format) before going live.
"""
import csv, os, random

random.seed(42)
OUT_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------------- PHONES
PHONE_BRANDS = {
    'apple':   ('Apple',   ['iPhone 17', 'iPhone 17 Pro', 'iPhone 17 Pro Max', 'iPhone 16e']),
    'samsung': ('Samsung', ['Galaxy S26', 'Galaxy S26 Ultra', 'Galaxy A56', 'Galaxy Z Fold 7']),
    'google':  ('Google',  ['Pixel 10', 'Pixel 10 Pro', 'Pixel 9a']),
    'xiaomi':  ('Xiaomi',  ['Xiaomi 15', 'Xiaomi 15 Ultra', 'Redmi Note 14 Pro']),
    'oneplus': ('OnePlus', ['OnePlus 13', 'OnePlus 13R', 'OnePlus Nord 5']),
    'oppo':    ('Oppo',    ['Oppo Find X8', 'Oppo Reno 13']),
    'vivo':    ('Vivo',    ['Vivo X200', 'Vivo V40']),
    'nothing': ('Nothing', ['Nothing Phone 3', 'Nothing Phone 3a']),
}
PHONE_PROCESSORS = ['A19 Pro', 'A18', 'Snapdragon 8 Elite Gen 2', 'Snapdragon 7 Gen 4',
                     'Tensor G5', 'Dimensity 9400', 'Exynos 2500']
PHONE_COLORS = ['Titanium Black', 'Midnight', 'Starlight', 'Ocean Blue', 'Sand Gold', 'Graphite']

def gen_phones():
    rows = []
    for bid, (bname, models) in PHONE_BRANDS.items():
        for model in models:
            ram = random.choice([8, 12, 16])
            storage = random.choice([128, 256, 512])
            battery = random.randint(4200, 5500)
            rows.append({
                'id': slug(bid, model), 'brand': bname, 'name': model,
                'price': random.randint(89900, 459900), 'currency': 'PKR',
                'color_swatch': random.choice(['#F1E2B8','#DCE0C7','#2b2b2e','#c9ccd1']),
                'image_url': '',
                'display': f'{round(random.uniform(6.1,6.9),1)}" OLED, 120Hz',
                'processor': random.choice(PHONE_PROCESSORS),
                'ram': f'{ram}GB', 'storage': f'{storage}GB',
                'battery': f'{battery}mAh', 'weight': f'{random.randint(165,230)}g',
                'operating_system': 'iOS 19' if bid=='apple' else 'Android 16',
                'cameras': f'{random.choice([48,50,108,200])}MP main + {random.choice([12,13,32,48])}MP ultrawide',
                'charging': f'{random.choice([25,30,45,65,80,100])}W wired',
                'connectivity': '5G, Wi-Fi 7, NFC',
                'colors': ', '.join(random.sample(PHONE_COLORS, 2)),
                'source_name': 'Manufacturer listing (demo data)', 'source_url': '',
                'affiliate_url': f'https://example-retailer.com/product/{slug(bid, model)}?ref=buywisely-demo',
            })
    return rows

# ---------------------------------------------------------------- LAPTOPS
LAPTOP_BRANDS = {
    'apple':     ('Apple',     ['MacBook Air 13"', 'MacBook Air 15"', 'MacBook Pro 14"']),
    'dell':      ('Dell',      ['XPS 13', 'XPS 14', 'Inspiron 15']),
    'hp':        ('HP',        ['Spectre x360', 'Pavilion 15', 'Envy 14']),
    'lenovo':    ('Lenovo',    ['ThinkPad X1 Carbon', 'Yoga 9i', 'IdeaPad Slim 5']),
    'asus':      ('Asus',      ['Zenbook 14 OLED', 'ROG Zephyrus G14', 'Vivobook S15']),
    'acer':      ('Acer',      ['Swift Go 14', 'Predator Helios 16']),
    'microsoft': ('Microsoft', ['Surface Laptop 7', 'Surface Laptop Studio 2']),
    'msi':       ('MSI',       ['Prestige 14', 'Stealth 16']),
}
LAPTOP_CPUS = ['Apple M4', 'Apple M4 Pro', 'Intel Core Ultra 9 185H', 'Intel Core Ultra 7 155H',
               'AMD Ryzen 9 8945HS', 'AMD Ryzen 7 8840HS']

def gen_laptops():
    rows = []
    for bid, (bname, models) in LAPTOP_BRANDS.items():
        for model in models:
            ram = random.choice([8, 16, 32])
            storage = random.choice([256, 512, 1024])
            rows.append({
                'id': slug(bid, model), 'brand': bname, 'name': model,
                'price': random.randint(249900, 699900), 'currency': 'PKR',
                'color_swatch': random.choice(['#F1E2B8','#DCE0C7','#1f2024','#b8bcc2']),
                'image_url': '',
                'display': f'{round(random.uniform(13.3,16.0),1)}" {random.choice(["OLED","Liquid Retina","IPS"])}',
                'processor': random.choice(LAPTOP_CPUS),
                'gpu': random.choice(['Integrated', 'RTX 4050', 'RTX 4060', 'RTX 4070']),
                'ram': f'{ram}GB', 'storage': f'{storage if storage<1024 else "1"}{"GB" if storage<1024 else "TB"} SSD',
                'battery': f'{random.randint(10,20)} hrs',
                'weight': f'{round(random.uniform(1.2,2.1),2)}kg',
                'build_material': random.choice(['Aluminum unibody','CNC aluminum','Magnesium alloy']),
                'operating_system': 'macOS' if bid=='apple' else 'Windows 11',
                'ports': '2x Thunderbolt/USB-C, headphone jack',
                'source_name': 'Manufacturer listing (demo data)', 'source_url': '',
                'affiliate_url': f'https://example-retailer.com/product/{slug(bid, model)}?ref=buywisely-demo',
            })
    return rows

# ---------------------------------------------------------------- BIKES
BIKE_BRANDS = {
    'yamaha':      ('Yamaha',       ['YBR 125', 'YBR 125G', 'MT-15']),
    'honda':       ('Honda',        ['CG 125', 'CB 150F', 'CD 70']),
    'suzuki':      ('Suzuki',       ['GS 150', 'GD 110s']),
    'kawasaki':    ('Kawasaki',     ['Ninja 300', 'Z125 Pro']),
    'hero':        ('Hero',         ['HF Deluxe', 'Splendor Plus']),
    'bajaj':       ('Bajaj',        ['CT 125', 'Pulsar 150']),
    'ktm':         ('KTM',          ['Duke 125', 'Duke 200']),
    'royalenfield':('Royal Enfield',['Classic 350', 'Hunter 350']),
}

def gen_bikes():
    rows = []
    for bid, (bname, models) in BIKE_BRANDS.items():
        for model in models:
            cc = random.choice([70, 100, 110, 125, 150, 200, 300, 350])
            rows.append({
                'id': slug(bid, model), 'brand': bname, 'name': model,
                'price': random.randint(159000, 985000), 'currency': 'PKR',
                'color_swatch': random.choice(['#F0DCC8','#DCE0C7','#2b2b2e','#8a1f1f']),
                'image_url': '',
                'engine': f'{cc}cc, single-cylinder, air-cooled',
                'horsepower': f'{round(cc*0.09,1)} hp',
                'torque': f'{round(cc*0.08,1)} Nm',
                'transmission': random.choice(['4-speed manual','5-speed manual','6-speed manual']),
                'fuel_capacity': f'{random.randint(9,16)}L',
                'top_speed': f'{random.randint(85,140)} km/h',
                'fuel_economy': f'{random.randint(35,55)} km/l',
                'brakes': random.choice(['Front disc, rear drum','Front disc, rear disc','Front drum, rear drum']),
                'tire_size': '2.75-18 front / 90/90-18 rear',
                'seat_height': f'{random.randint(770,820)}mm',
                'ground_clearance': f'{random.randint(150,180)}mm',
                'weight': f'{random.randint(110,165)}kg',
                'colors': ', '.join(random.sample(['Red','Black','Blue','Green','Matte Grey'], 2)),
                'source_name': 'Manufacturer listing (demo data)', 'source_url': '',
                'affiliate_url': f'https://example-retailer.com/product/{slug(bid, model)}?ref=buywisely-demo',
            })
    return rows

# ---------------------------------------------------------------- CARS
CAR_BRANDS = {
    'toyota':  ('Toyota',  ['Corolla Altis', 'Yaris', 'Fortuner']),
    'honda':   ('Honda',   ['Civic', 'City', 'BR-V']),
    'suzuki':  ('Suzuki',  ['Alto', 'Swift', 'Cultus']),
    'hyundai': ('Hyundai', ['Elantra', 'Tucson']),
    'kia':     ('Kia',     ['Sportage', 'Picanto']),
    'nissan':  ('Nissan',  ['Sunny', 'X-Trail']),
    'mg':      ('MG',      ['HS', 'ZS']),
    'changan': ('Changan', ['Alsvin', 'Oshan X7']),
}

def gen_cars():
    rows = []
    for bid, (bname, models) in CAR_BRANDS.items():
        for model in models:
            hp = random.randint(95, 250)
            rows.append({
                'id': slug(bid, model), 'brand': bname, 'name': model,
                'price': random.randint(3200000, 11500000), 'currency': 'PKR',
                'color_swatch': random.choice(['#F1E2B8','#DCE0C7','#1a1a1a','#9aa3ad']),
                'image_url': '',
                'engine': f'{round(random.uniform(1.0,2.5),1)}L {random.choice(["4-cyl","Turbo","Hybrid"])}',
                'horsepower': f'{hp} hp',
                'torque': f'{round(hp*1.3)} Nm',
                'transmission': random.choice(['CVT','6-speed automatic','5-speed manual']),
                'drivetrain': random.choice(['FWD','AWD','RWD']),
                'fuel_economy': f'{random.randint(11,20)} km/l',
                'seats': random.choice([5, 5, 5, 7]),
                'airbags': random.choice([2, 4, 6, 7]),
                'adas': random.choice(['None', 'Lane assist + AEB', 'Full ADAS suite']),
                'infotainment': f'{random.choice([7,8,9,10])}" touchscreen',
                'source_name': 'Manufacturer listing (demo data)', 'source_url': '',
                'affiliate_url': f'https://example-retailer.com/product/{slug(bid, model)}?ref=buywisely-demo',
            })
    return rows

def slug(brand, model):
    s = f'{brand}-{model}'.lower()
    s = ''.join(c if c.isalnum() else '-' for c in s)
    while '--' in s: s = s.replace('--','-')
    return s.strip('-')

CATEGORY_FIELDS = {
    'phones': ['id','brand','name','price','currency','color_swatch','image_url',
               'display','processor','ram','storage','battery','weight','operating_system',
               'cameras','charging','connectivity','colors','source_name','source_url','affiliate_url'],
    'laptops': ['id','brand','name','price','currency','color_swatch','image_url',
                'display','processor','gpu','ram','storage','battery','weight','build_material',
                'operating_system','ports','source_name','source_url','affiliate_url'],
    'bikes': ['id','brand','name','price','currency','color_swatch','image_url',
              'engine','horsepower','torque','transmission','fuel_capacity','top_speed',
              'fuel_economy','brakes','tire_size','seat_height','ground_clearance','weight',
              'colors','source_name','source_url','affiliate_url'],
    'cars': ['id','brand','name','price','currency','color_swatch','image_url',
             'engine','horsepower','torque','transmission','drivetrain','fuel_economy',
             'seats','airbags','adas','infotainment','source_name','source_url','affiliate_url'],
}

GENERATORS = {'phones': gen_phones, 'laptops': gen_laptops, 'bikes': gen_bikes, 'cars': gen_cars}

def main():
    total = 0
    for cat, gen in GENERATORS.items():
        rows = gen()
        path = os.path.join(OUT_DIR, f'products_{cat}.csv')
        with open(path, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=CATEGORY_FIELDS[cat])
            w.writeheader()
            for r in rows:
                w.writerow(r)
        print(f'{cat}: {len(rows)} rows -> {path}')
        total += len(rows)
    print('TOTAL products:', total)

if __name__ == '__main__':
    main()
