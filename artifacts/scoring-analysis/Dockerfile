FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

RUN mkdir -p /app/runs

EXPOSE 4200

CMD ["python", "server.py"]
