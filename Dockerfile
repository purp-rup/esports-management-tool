# Start from a lightweight Python image
FROM python:3.12-slim

# Set the working directory inside the container
WORKDIR /EsportsManagementTool

RUN apt-get update && apt-get install -y \
    pkg-config \
    default-libmysqlclient-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*


# Copy and install dependencies
COPY EsportsManagementTool/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the source code
COPY . .

WORKDIR /EsportsManagementTool/EsportsManagementTool

# Expose the port Flask runs on
EXPOSE 5000

# Set the run variables
ENV FLASK_APP=EsportsManagementTool
ENV FLASK_DEBUG=1

# Command to run the application
CMD ["flask", "run", "--host", "0.0.0.0"]

