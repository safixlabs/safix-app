import { expect, test } from "@playwright/test"
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  encodeErrorResult,
  parseAbi
} from "viem"
import { contractMessages, humanError } from "../lib/errors"
import list from "./revert-reasons.json"

/**
 * Every revert reason in the contracts reads as its own sentence.
 *
 * The reasons are the checked-in list in `revert-reasons.json`, taken from the
 * contract commit it names. When the contracts change, that list is regenerated
 * and this is what says which sentences are missing.
 *
 * Each reason is put through the three shapes a revert reaches the app in: the
 * error viem raises when wagmi simulates a write, the one it raises when the node
 * refuses a transaction, and the bare message some wallets hand back. The last one
 * carries no "reason:" marker, so it is the shape where a short reason used to
 * swallow a longer one that contains it.
 */

const reasons = list.reasons as Record<string, string[]>
const deployed = list.deployed.reasons as Record<string, string[]>
const solidityError = parseAbi(["error Error(string)"])

const simulated = (reason: string, functionName: string) =>
  new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({
      abi: solidityError,
      data: encodeErrorResult({ abi: solidityError, errorName: "Error", args: [reason] }),
      functionName
    }),
    { abi: [], functionName }
  )

const sent = (reason: string) => new ExecutionRevertedError({ message: `execution reverted: ${reason}` })

const bare = (reason: string) => new Error(`execution reverted: ${reason}`)

test.describe("revert reasons", () => {
  test(`the table covers exactly the reasons in ${list.source}`, () => {
    expect(Object.keys(contractMessages).sort()).toEqual(Object.keys(reasons).sort())
  })

  // The app talks to a deployment, not to a branch. Whatever that deployment's bytecode
  // was built from has to be covered too, or an older revert reaches the screen raw.
  test(`every reason the forked deployment can revert with has a sentence (${list.deployed.source})`, () => {
    const uncovered = Object.keys(deployed).filter(reason => !contractMessages[reason])
    expect(uncovered).toEqual([])
  })

  test("no two reasons share a sentence", () => {
    const bySentence = new Map<string, string[]>()
    for (const [reason, sentence] of Object.entries(contractMessages)) {
      bySentence.set(sentence, [...(bySentence.get(sentence) ?? []), reason])
    }
    const shared = [...bySentence.values()].filter(group => group.length > 1)
    expect(shared).toEqual([])
  })

  for (const [reason, sites] of Object.entries(reasons)) {
    test(`"${reason}" reads as its own sentence (${sites.join(", ")})`, () => {
      const sentence = contractMessages[reason]
      expect(sentence, `no sentence for "${reason}"`).toBeTruthy()
      for (const site of sites) {
        const functionName = site.split(".")[1]
        expect(humanError(simulated(reason, functionName)), `simulated ${site}`).toBe(sentence)
      }
      expect(humanError(sent(reason)), "refused by the node").toBe(sentence)
      expect(humanError(bare(reason)), "bare wallet message").toBe(sentence)
    })
  }
})
