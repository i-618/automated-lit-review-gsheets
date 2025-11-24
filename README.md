# Automated Literature Review Fetching using Google Sheets
Automation of academic literature review by fetching the relevant papers from Semantic Scholar using Google App Scripts in Google Sheets. This script helps in fetching the latest papers related to a keyword. 

# Instructions

Lets setup an automated literature review for the topic of LLM Safety

### Step 1
Create a new Google Sheet where the research papers are to be listed

![New Google Sheet](images/new-sheet-app-scripts.png)

### Step 2
Setup the Google App Scripts by navigating from the Google Sheet top Menu Extension -> App Script. Paste the script from this repo. 

![LitReviewAutomationScript.js](LitReviewAutomationScript.js)

### Step 3
Modify the `SEARCH_KEYWORD` variable in the script to your topic of interest. For example: 
```javascript
  const SEARCH_KEYWORD = '"LLM + (Safety | Jailbreak)"';

```
Modify other parameters that you feel comfortable with. Save the script.

![App Script Editor](images/add-app-script.png)

### Step 4
Setup a time based trigger to run the script periodically. In the App Script Editor, navigate to Triggers (clock icon on left sidebar) -> Add Trigger (bottom right corner) -> Select `automatedLiteratureReviewRunner` function, select "Time-driven" event source, and choose your desired frequency (I prefer to trigger the script each time I open the Google Sheet, So that I actually read the papers and the list dont just pile up).

![Setup Trigger](images/add-trigger.png)


### Step 5
Thats it! You are all setup. You can also run the script manually from the App Script Editor by clicking the Run button (play icon). The script will fetch the latest papers related to your topic and append them to the Google Sheet. Now its your turn to read the papers and take notes!

![Google Sheet with fetched papers](images/automated-lit-review.png)


## Note
- The Semantic Scholar API has rate limits. If you plan to run the script frequently, consider applying for a API Key.
- Greatful to [Semantic Scholar](https://www.semanticscholar.org/) for providing free access to their API for academic research. 
[[ Kinney, Rodney Michael et al. “The Semantic Scholar Open Data Platform.” ArXiv abs/2301.10140 (2023): n. pag. ]]
- Greatful to Gemini and ChatGPT for helping me write the script.
