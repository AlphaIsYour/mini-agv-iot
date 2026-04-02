import pandas as pd
from sklearn.tree import DecisionTreeClassifier
import joblib

# load data
data = pd.read_csv("dataset.csv")

X = data[["weight", "delta", "distance"]]
y = data["label"]

# train model
model = DecisionTreeClassifier(max_depth=3)
model.fit(X, y)

# save model
joblib.dump(model, "model.pkl")

print("Model trained and saved as model.pkl")