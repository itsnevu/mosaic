---
title: We Measure the Rate. We Do Not Quote It.
summary: An APY you read off a dashboard is a forecast. The one Mosaic shows is a measurement, and the difference matters more than the number.
date: 2026-09-13
---

Every yield product shows you an APY, and almost none of them tell you where the number came from. Usually it is one of two things. Either it is the current instantaneous rate of the underlying pool, annualised, which is a forecast that assumes the next year looks like the last block, or it is a number somebody typed into a config file because it looked about right. Both are useful for marketing. Neither is useful for deciding whether your money is working.

Mosaic does something less exciting. Each adapter, the small contract that translates a lending vault into the verbs Mosaic understands, keeps a checkpoint of the vault's share price and the time it took that checkpoint. When asked for the current rate, it looks at how much the share price has risen since then, divides by how long it has been, and annualises that. That is the whole method. It is the same arithmetic you would do with a spreadsheet and two balance screenshots taken a week apart.

The consequence is that Mosaic cannot show you a rate it has not observed. On the day a vault goes live, the page reads a dash. After an hour, a first sample. After a day, something you could reasonably call a rate. This is inconvenient. It is also honest in a way that a forecast can never be, because the number can only be produced by money actually having been earned. Nobody can raise it by editing a file.

It also changes how the vault behaves. The rebalancing logic uses these measured rates, not the venues' advertised ones, to decide whether moving capital is worth the gas. A venue that advertises nine percent and has paid four for the last week is treated as a four percent venue, because that is what it is. Venues get credit for what they deliver, and the allocation drifts toward the ones that deliver.

There is a fair objection here, which is that a measured rate lags. If a pool's rate jumps tomorrow, Mosaic will take a while to notice. That is true, and we accept it. The failure mode of lagging is that you earn slightly less for a day. The failure mode of trusting a quote is that you earn nothing for a month while the dashboard says nine percent. We know which one we would rather explain to a depositor.
