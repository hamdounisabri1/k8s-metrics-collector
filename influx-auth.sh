#!/bin/bash

NAMESPACE="k8s-metrics"
SECRET_NAME="influxdb-influxdb2-auth"
POD_NAME="influxdb-influxdb2-0"

echo "Mot de passe admin InfluxDB :"
kubectl get secret $SECRET_NAME \
  -o jsonpath="{.data['admin-password']}" \
  -n $NAMESPACE | base64 --decode

echo ""
echo "-----------------------------------"

echo "Token InfluxDB :"
kubectl exec -n $NAMESPACE $POD_NAME -- influx auth list | head -n 2
