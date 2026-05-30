# Contributing to the Esports Management Tool

## Setup
After cloning, you will need to create a virtual environment within the project to run the application. The following instructions are for **Windows** machines&mdash;**MacOS/Linux** instructions can be found [here](https://flask.palletsprojects.com/en/stable/installation/#create-an-environment).
<br/>
<br/>
Starting from the **project root**:
```console
cd EsportsManagementTool
```
```console
py -3 -m venv .venv
```
```console
.venv\Scripts\activate
```

Within the virtual environment, install **Flask**:
```console
pip install Flask
```

Next, **install dependencies**:
```console
pip install -r requirements.txt
```

Then, you will need to go to .env and **populate** the variables.

Now, run in terminal:
```console
flask --app EsportsManagementTool run --debug
```

## Testing
Unit testing is primarily executed using **pytest**.
<br/>
<br/>
After activating the virtual environment, run **tests** with:
```console
python -m pytest
```

## When Committing...

Do **NOT** commit your .env file to the main branch.
