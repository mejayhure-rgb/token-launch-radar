# Token Radar — design notes (probe draft)

Our entry improves on the house starter in three ways.

First, the value model prices each pre-token protocol against live-token peers
in its own category, using the median market-cap to TVL ratio of those peers
in the same sealed snapshot, instead of one flat multiple for everything.

Second, products that cannot launch a fresh token (wrapped assets, staked or
bridged versions of a token that already trades, exchange wallets) are kept
off the ranked board and shown separately, with the reason stated.

Third, farm plans are written per category with a capital tier, a dollar
cost, a weekly cadence, a hold period and an exit step.

This file is a first probe so the transcript bundle path can be tested
before the full build. It will be revised as the model is written.
