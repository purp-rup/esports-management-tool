# Contributing to the Esports Management Tool

## Setup
After cloning, you will need to create a virtual environment within the project to run the application. You can follow [these instructions](https://flask.palletsprojects.com/en/stable/installation/#create-an-environment).
- You won't need to run the mkdir command after cloning, just right click the highlighted directory as shown in the image below *> Copy Path/Reference... > Absolute Path*, then continue with the cd command
<p align="center">
  <img width="390" height="344" alt="Directory to be selected" src="https://github.com/user-attachments/assets/2f32993e-fd39-4dae-b629-e7a516eb3f91" />
</p>
<br />

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
