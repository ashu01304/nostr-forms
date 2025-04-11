import {
  AnswerSettings,
  AnswerTypes,
  MatchRule,
  MaxRule,
  MinRule,
  RangeRule,
  RegexRule,
  ValidationRuleTypes,
} from "@formstr/sdk/dist/interfaces";
import { Rule } from "antd/es/form";
import dayjs from 'dayjs';

//TODO: Find a method better than "any" with overloads for dynamic types
function NumRange(rule: any): Rule;
function NumRange(rule: RangeRule): Rule {
  return {
    validator: (_: any, value: any) => {
      if (!value) return Promise.resolve();
      if (!rule.min && !rule.max) return Promise.resolve();
      if (rule.min && value[0] < rule.min) {
        return Promise.reject(`Please enter number more than ${rule.min}`);
      }
      if (rule.max && value[0] > rule.max) {
        return Promise.reject(`Please enter number less than ${rule.max}`);
      }
      return Promise.resolve();
    },
  };
}

function MinLength(rule: any): Rule;
function MinLength(rule: MinRule): Rule {
  return {
    validator: (_: any, value: any) => {
      if (!value) return Promise.resolve();
      if (!rule.min) return Promise.resolve();
      if (value[0].length < rule.min) {
        return Promise.reject(`Please enter more than ${rule.min} chars`);
      }
      return Promise.resolve();
    },
  };
}

function MaxLength(rule: any): Rule;
function MaxLength(rule: MaxRule): Rule {
  return {
    validator: (_: any, value: any) => {
      if (!value) return Promise.resolve();
      if (!rule.max) return Promise.resolve();
      if (value[0].length > rule.max) {
        return Promise.reject(`Please enter less than ${rule.max} chars`);
      }
      return Promise.resolve();
    },
  };
}

function Regex(rule: any): Rule;
function Regex(rule: RegexRule): Rule {
  return {
    validator: (_: any, value: any) => {
      if (!value) return Promise.resolve();
      if (!rule.pattern) return Promise.resolve();
      if (!new RegExp(rule.pattern).test(value[0])) {
        return Promise.reject(
          rule.errorMessage || `Did not match the pattern: ${rule.pattern}`
        );
      }
      return Promise.resolve();
    },
  };
}

function Match(rule: any): Rule;
function Match(rule: MatchRule): Rule {
  return {
    validator: (_: any, value: any) => {
      if (!value) return Promise.resolve();
      if (!rule.answer) return Promise.resolve();

      const userValue = value[0];
      if (userValue === rule.answer) {
        return Promise.resolve();
      }

      return Promise.reject(
        `This is not the correct answer for this question`
      );
    },
  };
}

function validateNotFutureDate(): Rule {
  return {
    validator: async (_, value) => {
      if (!value || !value[0]) {
        return Promise.resolve();
      }
      const selectedDate = dayjs(value[0]);
      if (selectedDate.isValid() && selectedDate.isAfter(dayjs().endOf('day'))) {
        return Promise.reject(new Error("Date cannot be in the future."));
      }
      return Promise.resolve();
    },
  };
}

const RuleValidatorMap = {
  [ValidationRuleTypes.range]: NumRange,
  [ValidationRuleTypes.max]: MaxLength,
  [ValidationRuleTypes.min]: MinLength,
  [ValidationRuleTypes.regex]: Regex,
  [ValidationRuleTypes.match]: Match,
};

function createRule(
  ruleType: ValidationRuleTypes,
  validationRules: AnswerSettings["validationRules"]
): Rule {
  if (!validationRules) return {};
  const ruleCreator = RuleValidatorMap[ruleType];
  const rule = validationRules[ruleType];
  if (!rule) return {};
  return ruleCreator(rule);
}

export const getValidationRules = (
  answerType: AnswerTypes,
  answerSettings: AnswerSettings
) => {
  let rules: Rule[] = [];
  let validationRules = answerSettings.validationRules;
  if (!validationRules) return rules;
  let ruleTypes = Object.keys(validationRules) as ValidationRuleTypes[];
  ruleTypes.forEach((ruleType) => {
    if (validationRules && validationRules[ruleType]) {
      rules.push(createRule(ruleType, validationRules));
    }
  });
  if (answerSettings.disableFuture) {
    rules.push(validateNotFutureDate());
  }
  return rules;
};
