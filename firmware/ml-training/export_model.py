import joblib
from sklearn.tree import _tree

model = joblib.load("model.pkl")
tree = model.tree_

feature_names = ["weight", "delta", "distance"]

def recurse(node):
    if tree.feature[node] != _tree.TREE_UNDEFINED:
        name = feature_names[tree.feature[node]]
        threshold = tree.threshold[node]

        return f"""
if ({name} <= {threshold:.2f}) {{
    {recurse(tree.children_left[node])}
}} else {{
    {recurse(tree.children_right[node])}
}}
"""
    else:
        value = tree.value[node]
        class_id = value.argmax()
        return f"return {class_id};"

code = f"""
int predict(float weight, float delta, float distance) {{
{recurse(0)}
}}
"""

with open("model_c.txt", "w") as f:
    f.write(code)

print("Model exported to model_c.txt")