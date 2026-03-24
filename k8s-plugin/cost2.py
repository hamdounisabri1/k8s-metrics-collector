#!/usr/bin/env python3

import argparse
from influxdb_client import InfluxDBClient
from datetime import datetime
import re
import sys
import json

# --- Connexion InfluxDB ---
INFLUX_URL = "http://192.168.1.1:30086"
INFLUX_TOKEN = "3aPX5FObfUix6Z1HAuuH9dyMh7eTpGyg"
INFLUX_ORG = "influxdata"
INFLUX_BUCKET = "cluster_metrics"

# --- Charger les prix depuis JSON ---
with open("/home/shamdouni/k8s-workload-cost-analysis/prices.json") as f:
    prices = json.load(f)

CPU_PRICE = prices.get("CPU_PRICE", 0.02)
RAM_PRICE = prices.get("RAM_PRICE", 0.02)
STORAGE_PRICE = prices.get("STORAGE_PRICE", 0.01)

# --- Arguments ---
parser = argparse.ArgumentParser(description="Historique des coûts Kubernetes depuis InfluxDB")
parser.add_argument("-n", "--namespace", help="Filtrer par namespace")
parser.add_argument("-p", "--pod", help="Filtrer par pod (nécessite -n)")
parser.add_argument("-N", "--node", help="Filtrer par node")
parser.add_argument("-t", "--time", default="1h", help="Plage de temps: ex '30m', '1h', '7d'")
args = parser.parse_args()

# --- Validation ---
if args.pod and not args.namespace:
    print("Erreur : -p doit être utilisé avec -n <namespace>")
    sys.exit(1)

if not re.match(r"^\d+[mhd]$", args.time):
    print("Erreur : -t doit être au format nombre + unité (m,h,d). Ex: 30m, 1h, 7d")
    sys.exit(1)

# --- Connexion Influx ---
client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
query_api = client.query_api()

# --- Construction flux ---
flux = f'''
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: -{args.time})
'''
if args.namespace:
    flux += f'  |> filter(fn: (r) => r["namespace"] == "{args.namespace}")\n'
if args.pod:
    flux += f'  |> filter(fn: (r) => r["pod"] == "{args.pod}")\n'
if args.node:
    flux += f'  |> filter(fn: (r) => r["node"] == "{args.node}")\n'

flux += '''
  |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
  |> keep(columns: ["_time", "pod", "cpu_cores", "ram_gb", "storage_gb"])
  |> sort(columns: ["_time"])
'''

# --- Exécution ---
try:
    tables = query_api.query(flux)
except Exception as e:
    print("Erreur lors de la requête InfluxDB:", e)
    sys.exit(1)

# --- Largeurs ---
TIME_W = 19
POD_W = 30
COST_W = 10

# --- Header ---
header = f"{'TIME':<{TIME_W}} {'POD':<{POD_W}} {'CPU($)':>{COST_W}} {'RAM($)':>{COST_W}} {'STORAGE($)':>{COST_W}} {'TOTAL($)':>{COST_W}}"
print(header)
print("-" * (TIME_W + POD_W + COST_W*4 + 5))

# --- Affichage coût ---
found = False
for table in tables:
    for record in table.records:
        found = True
        pod_name = record.values.get('pod', '-')
        if len(pod_name) > POD_W:
            pod_name = pod_name[:POD_W-3] + "..."

        time_str = record.get_time().strftime("%Y-%m-%d %H:%M:%S")

        cpu_cost = record.values.get('cpu_cores',0) * CPU_PRICE
        ram_cost = record.values.get('ram_gb',0) * RAM_PRICE
        storage_cost = record.values.get('storage_gb',0) * STORAGE_PRICE
        total_cost = cpu_cost + ram_cost + storage_cost

        print(
            f"{time_str:<{TIME_W}} "
            f"{pod_name:<{POD_W}} "
            f"{cpu_cost:>{COST_W}.4f} "
            f"{ram_cost:>{COST_W}.4f} "
            f"{storage_cost:>{COST_W}.4f} "
            f"{total_cost:>{COST_W}.4f}"
        )

# --- Gestion des cas vides ---
if not found:
    if args.pod:
        print(f"Erreur : pod '{args.pod}' introuvable dans le namespace '{args.namespace}'")
    elif args.namespace:
        print(f"Erreur : namespace '{args.namespace}' introuvable ou vide")
    elif args.node:
        print(f"Erreur : node '{args.node}' introuvable ou vide")
    else:
        print("Aucune métrique trouvée pour la requête.")
