# Contributing to Esports Vantage

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

## When Committing...

Do **NOT** commit your .env file to the main branch.

## Testing
Unit, functional, and E2E testing is primarily executed using **pytest**.
<br/>

**Important Note:** **Docker** is required to run tests using the test DB and mailpit.
<br/>

Documentation can be found within the shared drive under the documentation folder called:
<br/>
`Vantage Testing Reference`
<br/>

See `test-init/README.md` for details on how to clone the real DB schema into the test DB.