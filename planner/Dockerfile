FROM python:3.12-slim
WORKDIR /srv
COPY planner/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY planner/app ./app
USER nobody
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
