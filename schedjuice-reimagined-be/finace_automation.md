# Finance Automation Workflow

In this document, I will detail how I built a system that automated 95% of manual labour using various engineering, heuristics and ML approaches. I will be detailing various problems I encountered, how I approached them, considered solutions, and the reason for the settled final solutions.


## Problem Statement

In Teacher Su International School (the school that benefited from the system), when collecting payments from students, it's a totally manual work that literal hundreds of people have to contribute to every month. Various departments play different roles in handling over 2700 screenshots.

Since the school doesn't want to use e-wallets due to cost and other concerns, whenever students make their monthly payment, a "payment proof" screenshot of the transaction receipt has to be submitting. Firstly, every month, each class has to create an assignment in their own respective Microsoft Teams so that students have a place to upload their screenshots. Then, assistant teachers have to download each screenshot, extract certain data (depends on the bank type) from them, and key in those data in various excel sheets as instructed by the finance team.

There are several receiving bank accounts. The maintainer of those bank accounts then have to take screenshots of the transaction histories (some bank types allow excel export), and send them to the finance group chat. Then, the finance team members have to verify each transaction from the excel sheet. This process takes a 4-person team an entire month, and when a new month begins, this cycle would repeat all over agian. 


## The Data Pipeline Problem

The first issue we need to solve is that how do we label all those screenshots and manage them programmatically? This is an easy task due to the LMS that the school was already using (which was also built by me). Each student has their own account, so we can know which screenshot belongs to which student in which class. At first, I was thinking of about 70% automation, but later gravitated towards a passive automated system because I slowly realized that instructing hundreds of staff members to follow simple rules is much harder (and unrewarding) than solving a dozen NLP problems.

There are three main steps in tackling each screenshot.

- Classification: Identifying the bank type (or if it's even a valid e-receipt at all)
- Extraction: Extracting necessary metadata to be used in the last stage
- Verification: Ensuring the transaction actually happened and the correct amount was also deposited

Now, let me introduce you to the bank types we are dealing with: KPay, CB, AYA and KBZ. We have to solve the above three steps for each bank type, so roughly, 12 challenges.

Initially, I was solving the classification problem using a deep-learning model trained on 4000 different screenshot image dataset. That works, but it's rather slow, and hosting a deep-learning model is a boring engineering problem I didn't want to do. So, I flipped the Extraction and the Classification steps. I used a third-party OCR API to turn all image data into text. So, now, we are dealing with an entirely textual dataset, and hence just earned ourselves various NLP tools.


## Solving KPay

Kpay is the easiest of them all. It comes with a transaction ID string that's exactly of length 20. And, to look for the amount info, I just used the regular expression below and some inline Python converted that to a float.

```py
expression = r'^.*(?:0\.00 |Ks)$'
```

In the receiver side also, they let you export an excel sheet with all the information included. So, it was just looping through each row and if it's in our database, then, it's a verified transaction. 


## Solving CB

CB also works in the same way. It has a transaction ID that starts with the characters "FT", so I just captured that with regex, and the amount extraction was also similar. CB doesn't allow an excel export though, so the transaction history screenshots also have to go through an OCR transformation. Then, we just check if the transaction IDs matched.


## Solving AYA

<img width="437" height="466" alt="image" src="https://github.com/user-attachments/assets/39f501c0-01e2-424c-850a-b8367f5e1430" />

AYA screenshots look like this. In the receiver side, they also only show the amount received, received date and the sender account number. So, during the manual way, they had to check the sender's account number, and when they uploaded the screenshot to Microsoft Teams. Then, if there is a transaction from that account with that amount in roughly around that date, then, the transaction is verified. 

So, we need to get the "from account" account number. String length doesn't work here because we might get confused with the receiver account number. Luckily, the OCR API also returns the x,y positions of the text overlay boxes. And, conveniently, the "from account" label was closer to the "from account" number with relative to "to account" number. So, it's just a simple distance calculation. Two account numbers, less distance = correct account number.

<img width="828" height="466" alt="image" src="https://github.com/user-attachments/assets/aebc2672-fbab-4698-8cbd-cabab7b405ca" />

The amount extraction here works just like the rest. For the verification, again, we convert the receiver transaction history into workable data using OCR, then, we used the uploaded time of the screenshot, and searched about 15-20 days into the past (receiver's side recived date). If the amount and the "from account" numbers matched, then, we got overselves a verified transaction. 

## Solving KBZ

KBZ screenshots have a "notes" section at the bottom where the sender can write anything. The receiver can export an excel sheet that doesn't contain useful information but contains the "notes" column. So, we had to match those two. But, we couldn't just do a naive string equality check. Because of the varying qualities of the screenshots (some are taken rotated, taken with another phone while the other phone is rotated, distorted, or with glares. Notifications and other elements may also cover some of the texts in the notes section). Plus, there isn't also a regex way to tell where the notes are. So, I ended up using all the OCR data of the screenshot and just kept them. Then, I used a fuzzy string matching algorithm to get a confidence percentage, and if it's over a certain threshold, then the notes must match and we got ourselves another verified transaction.

```py
def smart_contains(needle, haystack):
    if needle in haystack:
        return True, 1.0

    from rapidfuzz import fuzz
    score = fuzz.token_set_ratio(needle, haystack)
    if score > 85:
        return True, score / 100

    return False, score / 100
```



