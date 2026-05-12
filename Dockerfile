# Start from a lightweight Python image
FROM python:3.12-slim

# Set the working directory inside the container
WORKDIR /EsportsManagementTool

# Copy and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the source code
COPY . .

# Expose the port Flask runs on
EXPOSE 5000

# Command to run the application
CMD ["python", "__init__.py"]
