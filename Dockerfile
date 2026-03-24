FROM python:3.11-slim
WORKDIR /app
COPY collector.py .
RUN pip install kubernetes influxdb-client
CMD ["python", "collector.py"]
