#!/usr/bin/env python3
import os
import datetime
import time
from kubernetes import client, config
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

# --- Variables d'environnement pour InfluxDB ---
INFLUX_URL = os.getenv("INFLUX_URL")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN")
INFLUX_ORG = os.getenv("INFLUX_ORG")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET")

# --- Connexion Kubernetes dans le pod ---
config.load_incluster_config()
v1 = client.CoreV1Api()
custom_api = client.CustomObjectsApi()

# --- Connexion InfluxDB ---
influx_client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
write_api = influx_client.write_api(write_options=SYNCHRONOUS)

# --- Fonctions de parsing CPU / RAM ---
def parse_cpu(cpu_str):
    """Convertit la CPU en cores"""
    if cpu_str.endswith("n"):
        return int(cpu_str[:-1]) / 1e9
    if cpu_str.endswith("u"):
        return int(cpu_str[:-1]) / 1e6
    if cpu_str.endswith("m"):
        return int(cpu_str[:-1]) / 1000
    return float(cpu_str)

def parse_memory(mem_str):
    """Convertit la RAM en GB"""
    if mem_str.endswith("Ki"):
        return int(mem_str[:-2]) / (1024*1024)
    if mem_str.endswith("Mi"):
        return int(mem_str[:-2]) / 1024
    if mem_str.endswith("Gi"):
        return int(mem_str[:-2])
    if mem_str.endswith("Ti"):
        return int(mem_str[:-2]) * 1024
    return int(mem_str) / (1024**3)

# --- Boucle principale ---
while True:
    try:
        # Récupération des métriques de tous les pods
        metrics = custom_api.list_cluster_custom_object(
            group="metrics.k8s.io",
            version="v1beta1",
            plural="pods"
        )["items"]

        for pod in metrics:
            namespace = pod["metadata"]["namespace"]
            pod_name = pod["metadata"]["name"]

            # Node associé
            try:
                pod_obj = v1.read_namespaced_pod(name=pod_name, namespace=namespace)
                node_name = pod_obj.spec.node_name
            except Exception:
                node_name = "N/A"

            # CPU / RAM total pour le pod (en cores et GB)
            total_cpu_cores = sum(parse_cpu(c["usage"]["cpu"]) for c in pod["containers"])
            total_ram_gb = sum(parse_memory(c["usage"]["memory"]) for c in pod["containers"])

            # Stockage via PVC
            storage_gb = 0
            try:
                for vol in pod_obj.spec.volumes:
                    if vol.persistent_volume_claim:
                        pvc_name = vol.persistent_volume_claim.claim_name
                        try:
                            pvc = v1.read_namespaced_persistent_volume_claim(pvc_name, namespace)
                            storage = pvc.spec.resources.requests.get("storage", "0Gi")
                            if storage.endswith("Gi"):
                                storage_gb += int(storage[:-2])
                            elif storage.endswith("Mi"):
                                storage_gb += int(storage[:-2]) / 1024
                        except Exception:
                            pass
            except Exception:
                pass

            # Écriture dans InfluxDB
            point = Point("k8s_metrics") \
                .tag("node", node_name) \
                .tag("namespace", namespace) \
                .tag("pod", pod_name) \
                .field("cpu_cores", float(total_cpu_cores)) \
                .field("ram_gb", float(total_ram_gb)) \
                .field("storage_gb", float(storage_gb)) \
                .time(datetime.datetime.utcnow())

            write_api.write(bucket=INFLUX_BUCKET, record=point)


    except Exception as e:
        print("Erreur récupération métriques :", e)

    time.sleep(60)
